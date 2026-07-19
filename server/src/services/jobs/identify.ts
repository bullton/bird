import { readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { db, schema } from '../../db/client.js';
import { eq } from 'drizzle-orm';
import { config } from '../../config.js';
import { callIdentify, callGenerateDescription } from '../ai-client.js';

/**
 * 识别成功后清理 AI 图片文件，节省磁盘
 */
export async function cleanupAiImage(sightingId: number) {
  const row = db.select({ pathAi: schema.sightings.pathAi })
    .from(schema.sightings)
    .where(eq(schema.sightings.id, sightingId))
    .get();
  if (!row?.pathAi) return;
  const abs = path.resolve(config.photosDir, row.pathAi);
  try {
    await unlink(abs);
  } catch {
    // 文件不存在也无所谓
  }
  db.update(schema.sightings)
    .set({ pathAi: '' })
    .where(eq(schema.sightings.id, sightingId))
    .run();
}

export async function processIdentify(sightingId: number, _taskId: number) {
  const sighting = db.select().from(schema.sightings).where(eq(schema.sightings.id, sightingId)).get();
  if (!sighting) throw new Error('sighting not found');

  // AI 图已被清理过（之前成功了），则用 main 图重新识别
  const relPath = sighting.pathAi || sighting.pathMain;
  const imageAbs = path.resolve(config.photosDir, relPath);
  const buffer = await readFile(imageAbs);

  const result = await callIdentify(buffer, {
    takenAt: sighting.takenAt ?? undefined,
    locationName: sighting.locationName ?? undefined,
  });

  let speciesId: number | null = null;
  let speciesName: string | null = null;

  const top = result.candidates[0];
  if (top) {
    speciesName = top.chinese_name ?? top.scientific_name ?? null;
    const existing = top.scientific_name
      ? db.select().from(schema.species).where(eq(schema.species.scientificName, top.scientific_name)).get()
      : null;
    if (existing) {
      speciesId = existing.id;
    } else {
      const inserted = db.insert(schema.species).values({
        scientificName: top.scientific_name || top.chinese_name || 'Unknown',
        chineseName: top.chinese_name ?? null,
        englishName: top.english_name ?? null,
        orderName: top.order_name ?? null,
        familyName: top.family_name ?? null,
        genus: top.genus ?? null,
        conservation: top.conservation ?? null,
        bodyLengthCm: top.body_length_cm ?? null,
        createdVia: 'ai',
      }).returning({ id: schema.species.id }).get();
      speciesId = inserted.id;
      if (top.scientific_name) {
        await tryGenerateDescription(speciesId, top.scientific_name, top.chinese_name ?? '');
      }
    }
  }

  const confidenceMax = top?.confidence ?? null;
  const status: 'pending' | 'confirmed' | 'corrected' | 'failed' =
    !top ? 'failed' :
    (confidenceMax as number) !== null && (confidenceMax as number) >= 0.7 ? 'confirmed' :
    'pending';

  db.update(schema.sightings).set({
    speciesId,
    identificationJson: JSON.stringify(result.candidates),
    confidenceMax,
    aiProvider: 'minimax',
    aiModel: result.model,
    aiRequestId: result.requestId,
    status,
  }).where(eq(schema.sightings.id, sightingId)).run();

  // 识别成功后清理 AI 图片
  if (status === 'confirmed' || status === 'corrected') {
    await cleanupAiImage(sightingId);
  }

  console.log(`[identify] sighting ${sightingId} → ${speciesName ?? 'unknown'} (confidence=${confidenceMax}, status=${status})`);
}

async function tryGenerateDescription(speciesId: number, scientificName: string, chineseName: string) {
  try {
    const desc = await callGenerateDescription(scientificName, chineseName);
    db.update(schema.species).set({
      description: desc.description,
      habitat: desc.habitat ?? null,
      diet: desc.diet ?? null,
      distribution: desc.distribution ?? null,
      updatedAt: new Date().toISOString(),
    }).where(eq(schema.species.id, speciesId)).run();
  } catch (err) {
    console.warn(`[identify] failed to generate description for ${scientificName}:`, err);
  }
}