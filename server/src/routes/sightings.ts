import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db, schema } from '../db/client.js';
import { and, desc, eq, isNull, like, or, sql } from 'drizzle-orm';
import { processUpload, fileUrl, removeFiles } from '../services/image-processor.js';
import { cleanupAiImage } from '../services/jobs/identify.js';
import { callGenerateDescription } from '../services/ai-client.js';
import { config } from '../config.js';

const PAGE_SIZE = 30;

const updateSightingSchema = z.object({
  speciesId: z.number().int().nullable().optional(),
  userNote: z.string().max(2000).nullable().optional(),
  isFavorite: z.boolean().optional(),
  takenAt: z.string().optional(),
});

const confirmSchema = z.object({
  speciesId: z.number().int().optional(),
  scientificName: z.string().max(200).optional(),
});

async function upsertSpeciesByScientificName(userInput: string): Promise<number> {
  // 先按 scientificName 或 chineseName 查找已有物种
  const existing =
    db.select({ id: schema.species.id })
      .from(schema.species)
      .where(eq(schema.species.scientificName, userInput))
      .get() ??
    db.select({ id: schema.species.id })
      .from(schema.species)
      .where(eq(schema.species.chineseName, userInput))
      .get();
  if (existing) return existing.id;

  // 调用 AI：输入可能是中文名也可能是学名，AI 需要识别并给出完整数据
  const desc = await callGenerateDescription(userInput, userInput);

  // 用 AI 返回的标准拉丁学名（关键！不能直接用用户输入作学名）
  const sci = (desc.scientific_name && desc.scientific_name.trim()) || userInput;
  const cn = (desc.chinese_name && desc.chinese_name.trim()) || userInput;

  // 双重去重：用 AI 返回的学名/中文名再查一次
  const dup =
    db.select({ id: schema.species.id })
      .from(schema.species)
      .where(eq(schema.species.scientificName, sci))
      .get() ??
    db.select({ id: schema.species.id })
      .from(schema.species)
      .where(eq(schema.species.chineseName, cn))
      .get();
  if (dup) return dup.id;

  const inserted = db.insert(schema.species).values({
    scientificName: sci,
    chineseName: cn,
    englishName: desc.english_name ?? null,
    className: desc.class_name ?? null,
    orderName: desc.order_name ?? null,
    familyName: desc.family_name ?? null,
    genus: desc.genus ?? null,
    conservation: desc.conservation ?? null,
    citesAppendix: desc.cites_appendix ?? null,
    bodyLengthCm: desc.body_length_cm ?? null,
    description: desc.description,
    habitat: desc.habitat ?? null,
    diet: desc.diet ?? null,
    distribution: desc.distribution ?? null,
    funFacts: desc.fun_facts ?? null,
    createdVia: 'ai',
  }).returning({ id: schema.species.id }).get();
  return inserted.id;
}

export async function sightingRoutes(app: FastifyInstance) {
  app.post('/api/sightings', { preHandler: app.requireMember }, async (req, reply) => {
    if (!req.isMultipart()) {
      return reply.code(400).send({ error: 'Expected multipart/form-data' });
    }

    const results: Array<{ id: number; status: string; thumbUrl: string; mainUrl: string }> = [];
    const errors: Array<{ filename: string; error: string }> = [];

    for await (const part of req.files({ limits: { fileSize: config.uploadMaxBytes } })) {
      const buffer = await part.toBuffer();
      if (part.file.truncated) {
        errors.push({ filename: part.filename, error: '文件超过 30MB' });
        continue;
      }

      let processed;
      try {
        processed = await processUpload(buffer, part.filename);
      } catch (err: any) {
        errors.push({ filename: part.filename, error: err?.message ?? '处理失败' });
        continue;
      }

      const existing = db.select({ id: schema.sightings.id })
        .from(schema.sightings)
        .where(and(eq(schema.sightings.photoHash, processed.hash), isNull(schema.sightings.deletedAt)))
        .get();
      if (existing) {
        errors.push({ filename: part.filename, error: '照片已存在' });
        continue;
      }

      const inserted = db.insert(schema.sightings).values({
        userId: req.authUser!.id,
        pathOriginal: processed.originalRel,
        pathMain: processed.mainRel,
        pathAi: processed.aiRel,
        pathThumb: processed.thumbRel,
        photoHash: processed.hash,
        fileSizeBytes: processed.originalSize,
        takenAt: processed.exif.takenAt ?? new Date().toISOString(),
        lat: processed.exif.lat ?? null,
        lng: processed.exif.lng ?? null,
        altitudeM: processed.exif.altitudeM ?? null,
        locationSource: processed.exif.lat ? 'exif' : null,
        exifJson: JSON.stringify(processed.exif.raw),
        status: 'pending',
        aiProvider: 'minimax',
      }).returning({ id: schema.sightings.id }).get();

      db.insert(schema.taskQueue).values({
        sightingId: inserted.id,
        taskType: 'identify',
      }).run();

      results.push({
        id: inserted.id,
        status: 'pending',
        thumbUrl: fileUrl(processed.thumbRel),
        mainUrl: fileUrl(processed.mainRel),
      });
    }

    if (results.length === 0 && errors.length > 0) {
      return reply.code(400).send({ error: errors[0].error, filename: errors[0].filename });
    }

    return { items: results, errors };
  });

  app.get('/api/sightings', async (req, reply) => {
    const q = z.object({
      page: z.coerce.number().int().min(1).default(1),
      speciesId: z.coerce.number().int().optional(),
      status: z.enum(['pending', 'confirmed', 'corrected', 'failed']).optional(),
      favorite: z.coerce.boolean().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      view: z.enum(['all', 'pending_only', 'identified']).default('all'),
    }).safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'Invalid query' });
    const { page, speciesId, status, favorite, from, to, view } = q.data;

    const conds: any[] = [isNull(schema.sightings.deletedAt)];
    if (speciesId) conds.push(eq(schema.sightings.speciesId, speciesId));
    if (status) conds.push(eq(schema.sightings.status, status));
    if (favorite) conds.push(eq(schema.sightings.isFavorite, 1));
    if (from) conds.push(sql`${schema.sightings.takenAt} >= ${from}`);
    if (to) conds.push(sql`${schema.sightings.takenAt} <= ${to}`);
    if (view === 'pending_only') {
      conds.push(or(eq(schema.sightings.status, 'pending'), eq(schema.sightings.status, 'failed'))!);
    } else if (view === 'identified') {
      conds.push(or(eq(schema.sightings.status, 'confirmed'), eq(schema.sightings.status, 'corrected'))!);
    }
    const where = conds.length > 1 ? and(...conds) : conds[0];

    const total = db.select({ c: sql<number>`count(*)` }).from(schema.sightings).where(where).get()?.c ?? 0;

    const rows = db
      .select({
        id: schema.sightings.id,
        userId: schema.sightings.userId,
        speciesId: schema.sightings.speciesId,
        pathThumb: schema.sightings.pathThumb,
        pathMain: schema.sightings.pathMain,
        takenAt: schema.sightings.takenAt,
        uploadedAt: schema.sightings.uploadedAt,
        status: schema.sightings.status,
        confidenceMax: schema.sightings.confidenceMax,
        identificationJson: schema.sightings.identificationJson,
        isFavorite: schema.sightings.isFavorite,
        userNote: schema.sightings.userNote,
        scientificName: schema.species.scientificName,
        chineseName: schema.species.chineseName,
        englishName: schema.species.englishName,
        familyName: schema.species.familyName,
        username: schema.users.username,
        displayName: schema.users.displayName,
      })
      .from(schema.sightings)
      .leftJoin(schema.species, eq(schema.sightings.speciesId, schema.species.id))
      .leftJoin(schema.users, eq(schema.sightings.userId, schema.users.id))
      .where(where)
      .orderBy(desc(schema.sightings.takenAt), desc(schema.sightings.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE)
      .all();

    const items = rows.map((r) => ({
      ...r,
      thumbUrl: fileUrl(r.pathThumb),
      mainUrl: fileUrl(r.pathMain),
      identification: r.identificationJson ? JSON.parse(r.identificationJson) : null,
      isFavorite: !!r.isFavorite,
    }));

    return { items, total, page, pageSize: PAGE_SIZE };
  });

  app.get<{ Params: { id: string } }>('/api/sightings/:id', async (req, reply) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' });
    const r = db
      .select({
        sighting: schema.sightings,
        species: schema.species,
        user: schema.users,
      })
      .from(schema.sightings)
      .leftJoin(schema.species, eq(schema.sightings.speciesId, schema.species.id))
      .leftJoin(schema.users, eq(schema.sightings.userId, schema.users.id))
      .where(and(eq(schema.sightings.id, id), isNull(schema.sightings.deletedAt)))
      .get();
    if (!r || !r.sighting) return reply.code(404).send({ error: 'Not found' });
    return {
      ...r.sighting,
      isFavorite: !!r.sighting.isFavorite,
      exif: r.sighting.exifJson ? JSON.parse(r.sighting.exifJson) : null,
      identification: r.sighting.identificationJson ? JSON.parse(r.sighting.identificationJson) : null,
      thumbUrl: fileUrl(r.sighting.pathThumb),
      mainUrl: fileUrl(r.sighting.pathMain),
      originalUrl: r.sighting.pathOriginal ? fileUrl(r.sighting.pathOriginal) : null,
      species: r.species,
      uploadedBy: r.user ? { id: r.user.id, username: r.user.username, displayName: r.user.displayName } : null,
    };
  });

  app.patch<{ Params: { id: string } }>('/api/sightings/:id', { preHandler: app.requireMember }, async (req, reply) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' });
    const parsed = updateSightingSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid input' });
    const row = db.select().from(schema.sightings).where(eq(schema.sightings.id, id)).get();
    if (!row || row.deletedAt) return reply.code(404).send({ error: 'Not found' });

    const updates: Partial<typeof schema.sightings.$inferInsert> = {};
    if (parsed.data.speciesId !== undefined) {
      updates.speciesId = parsed.data.speciesId;
      if (parsed.data.speciesId && row.speciesId !== parsed.data.speciesId) {
        const aiTop = row.identificationJson ? (JSON.parse(row.identificationJson)?.[0]?.scientific_name ?? null) : null;
        db.insert(schema.identificationCorrections).values({
          sightingId: id,
          userId: req.authUser!.id,
          predictedTop: aiTop,
          correctedTo: parsed.data.speciesId,
          confidence: row.confidenceMax ?? null,
          correctionType: 'wrong_species',
        }).run();
        updates.status = 'corrected';
      } else if (!parsed.data.speciesId) {
        updates.speciesId = null;
      }
    }
    if (parsed.data.userNote !== undefined) updates.userNote = parsed.data.userNote;
    if (parsed.data.isFavorite !== undefined) updates.isFavorite = parsed.data.isFavorite ? 1 : 0;
    if (parsed.data.takenAt) updates.takenAt = parsed.data.takenAt;

    db.update(schema.sightings).set(updates).where(eq(schema.sightings.id, id)).run();
    // 修改物种后状态变 corrected，清理 AI 图
    if (updates.status === 'corrected') {
      await cleanupAiImage(id);
    }
    return { ok: true };
  });

  app.delete<{ Params: { id: string } }>('/api/sightings/:id', { preHandler: app.requireMember }, async (req, reply) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' });
    const row = db.select().from(schema.sightings).where(eq(schema.sightings.id, id)).get();
    if (!row) return reply.code(404).send({ error: 'Not found' });
    await removeFiles([row.pathOriginal, row.pathMain, row.pathAi, row.pathThumb]);
    db.update(schema.sightings)
      .set({ deletedAt: new Date().toISOString() })
      .where(eq(schema.sightings.id, id))
      .run();
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/api/sightings/:id/reidentify', { preHandler: app.requireMember }, async (req, reply) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' });
    const row = db.select().from(schema.sightings).where(eq(schema.sightings.id, id)).get();
    if (!row || row.deletedAt) return reply.code(404).send({ error: 'Not found' });
    db.update(schema.sightings).set({
      status: 'pending',
      identificationJson: null,
      confidenceMax: null,
      speciesId: null,
    }).where(eq(schema.sightings.id, id)).run();
    db.insert(schema.taskQueue).values({ sightingId: id, taskType: 'identify' }).run();
    return { ok: true, status: 'pending' };
  });

  app.post<{ Params: { id: string } }>('/api/sightings/:id/confirm', { preHandler: app.requireMember }, async (req, reply) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' });
    const parsed = confirmSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid input' });
    if (!parsed.data.speciesId && !parsed.data.scientificName) {
      return reply.code(400).send({ error: 'speciesId or scientificName required' });
    }
    const row = db.select().from(schema.sightings).where(eq(schema.sightings.id, id)).get();
    if (!row || row.deletedAt) return reply.code(404).send({ error: 'Not found' });

    let targetSpeciesId: number;
    if (parsed.data.speciesId) {
      targetSpeciesId = parsed.data.speciesId;
    } else {
      targetSpeciesId = await upsertSpeciesByScientificName(parsed.data.scientificName!);
    }

    const aiTop = row.identificationJson ? (JSON.parse(row.identificationJson)?.[0]?.scientific_name ?? null) : null;
    const correctionType = row.speciesId && row.speciesId !== targetSpeciesId ? 'wrong_species' : 'confirmed';
    db.update(schema.sightings).set({
      speciesId: targetSpeciesId,
      status: correctionType === 'confirmed' ? 'confirmed' : 'corrected',
    }).where(eq(schema.sightings.id, id)).run();
    await cleanupAiImage(id);
    if (correctionType !== 'confirmed') {
      db.insert(schema.identificationCorrections).values({
        sightingId: id,
        userId: req.authUser!.id,
        predictedTop: aiTop,
        correctedTo: targetSpeciesId,
        confidence: row.confidenceMax ?? null,
        correctionType,
      }).run();
    }
    return { ok: true };
  });

  app.get('/api/sightings/stats/counts', async () => {
    const rows = db.select({
      status: schema.sightings.status,
      c: sql<number>`count(*)`,
    }).from(schema.sightings).where(isNull(schema.sightings.deletedAt)).groupBy(schema.sightings.status).all();
    const m: Record<string, number> = { pending: 0, confirmed: 0, corrected: 0, failed: 0 };
    for (const r of rows) m[r.status] = r.c;
    return m;
  });
}