import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db, schema } from '../db/client.js';
import { and, count, desc, eq, isNull, like, or, sql } from 'drizzle-orm';

const PAGE_SIZE = 50;

const createSpeciesSchema = z.object({
  scientificName: z.string().min(1).max(200),
  chineseName: z.string().max(120).optional(),
  englishName: z.string().max(200).optional(),
  orderName: z.string().max(120).optional(),
  familyName: z.string().max(120).optional(),
  genus: z.string().max(120).optional(),
  conservation: z.string().max(20).optional(),
  description: z.string().max(5000).optional(),
  habitat: z.string().max(2000).optional(),
  diet: z.string().max(2000).optional(),
  distribution: z.string().max(2000).optional(),
  bodyLengthCm: z.number().optional(),
});

const updateSpeciesSchema = createSpeciesSchema.partial();

export async function speciesRoutes(app: FastifyInstance) {
  app.get('/api/species', async (req) => {
    const q = z.object({
      page: z.coerce.number().int().min(1).default(1),
      q: z.string().optional(),
      family: z.string().optional(),
      order: z.string().optional(),
    }).safeParse(req.query);
    const { page = 1, q: search, family, order } = q.success ? q.data : { page: 1 };

    const conds: any[] = [];
    if (search) {
      const like_ = `%${search}%`;
      const nameConds = or(
        like(schema.species.chineseName, like_),
        like(schema.species.scientificName, like_),
        like(schema.species.englishName, like_),
      );
      const aliasMatch = db.select({ speciesId: schema.speciesAliases.speciesId })
        .from(schema.speciesAliases)
        .where(eq(schema.speciesAliases.aliasName, search))
        .get();
      if (aliasMatch) {
        conds.push(or(nameConds, eq(schema.species.id, aliasMatch.speciesId))!);
      } else {
        conds.push(nameConds);
      }
    }
    if (family) conds.push(eq(schema.species.familyName, family));
    if (order) conds.push(eq(schema.species.orderName, order));
    const where = conds.length > 0 ? and(...conds) : undefined;

    const total = db.select({ c: count() }).from(schema.species).where(where).get()?.c ?? 0;

    const rows = db
      .select({
        id: schema.species.id,
        scientificName: schema.species.scientificName,
        chineseName: schema.species.chineseName,
        englishName: schema.species.englishName,
        orderName: schema.species.orderName,
        familyName: schema.species.familyName,
        genus: schema.species.genus,
        conservation: schema.species.conservation,
        bodyLengthCm: schema.species.bodyLengthCm,
        createdVia: schema.species.createdVia,
        sightingCount: sql<number>`(SELECT COUNT(*) FROM sightings WHERE sightings.species_id = ${schema.species.id} AND sightings.deleted_at IS NULL)`,
      })
      .from(schema.species)
      .where(where)
      .orderBy(schema.species.chineseName, schema.species.scientificName)
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE)
      .all();

    return { items: rows, total, page, pageSize: PAGE_SIZE };
  });

  app.get<{ Params: { id: string } }>('/api/species/:id', async (req, reply) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' });
    const sp = db.select().from(schema.species).where(eq(schema.species.id, id)).get();
    if (!sp) return reply.code(404).send({ error: 'Not found' });
    const counts = db.select({
      status: schema.sightings.status,
      c: sql<number>`count(*)`,
    }).from(schema.sightings)
      .where(and(eq(schema.sightings.speciesId, id), isNull(schema.sightings.deletedAt)))
      .groupBy(schema.sightings.status).all();
    const stats: Record<string, number> = { total: 0, pending: 0, confirmed: 0, corrected: 0, failed: 0 };
    for (const r of counts) { stats[r.status] = r.c; stats.total += r.c; }

    return { ...sp, stats };
  });

  app.post('/api/species', { preHandler: app.requireMember }, async (req, reply) => {
    const parsed = createSpeciesSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid input' });
    const exists = db.select({ id: schema.species.id }).from(schema.species)
      .where(eq(schema.species.scientificName, parsed.data.scientificName)).get();
    if (exists) return reply.code(409).send({ error: '物种已存在' });
    const inserted = db.insert(schema.species).values({
      ...parsed.data,
      createdVia: 'manual',
    }).returning({ id: schema.species.id }).get();
    return { id: inserted.id };
  });

  app.patch<{ Params: { id: string } }>('/api/species/:id', { preHandler: app.requireMember }, async (req, reply) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' });
    const parsed = updateSpeciesSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid input' });
    const sp = db.select().from(schema.species).where(eq(schema.species.id, id)).get();
    if (!sp) return reply.code(404).send({ error: 'Not found' });
    db.update(schema.species).set({
      ...parsed.data,
      updatedAt: new Date().toISOString(),
    }).where(eq(schema.species.id, id)).run();
    return { ok: true };
  });

  app.get('/api/species/stats/families', async () => {
    const rows = db.select({
      familyName: schema.species.familyName,
      orderName: schema.species.orderName,
      count: sql<number>`count(*)`,
    }).from(schema.species).groupBy(schema.species.familyName, schema.species.orderName).all();
    return rows;
  });
}