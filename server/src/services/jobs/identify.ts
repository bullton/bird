import { readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { db, schema } from '../../db/client.js';
import { eq, or, like } from 'drizzle-orm';
import { config } from '../../config.js';
import { callIdentify, callGenerateDescription } from '../ai-client.js';
import type { Candidate } from '../ai-client.js';

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
  }
  db.update(schema.sightings)
    .set({ pathAi: '' })
    .where(eq(schema.sightings.id, sightingId))
    .run();
}

function normSciName(name: string): string {
  return name.trim().toLowerCase();
}

function findSpeciesByCandidate(c: Candidate): { id: number } | null {
  if (!c.scientific_name) return null;
  const norm = normSciName(c.scientific_name);

  // 1. 按学名精确匹配（忽略大小写）
  const bySciName = db.select({ id: schema.species.id })
    .from(schema.species)
    .where(eq(schema.species.scientificName, c.scientific_name))
    .get();
  if (bySciName) return bySciName;

  // 2. 按中文名在别名表中查找
  if (c.chinese_name) {
    const alias = db.select({ speciesId: schema.speciesAliases.speciesId })
      .from(schema.speciesAliases)
      .where(eq(schema.speciesAliases.aliasName, c.chinese_name))
      .get();
    if (alias) {
      // 确认对应物种的学名（避免别名指向了错误物种）
      const sp = db.select({ id: schema.species.id, scientificName: schema.species.scientificName })
        .from(schema.species)
        .where(eq(schema.species.id, alias.speciesId))
        .get();
      if (sp) return { id: sp.id };
    }

    // 3. 按中文名直接匹配（兼容旧数据）
    const byChinese = db.select({ id: schema.species.id })
      .from(schema.species)
      .where(eq(schema.species.chineseName, c.chinese_name))
      .get();
    if (byChinese) return byChinese;
  }

  return null;
}

function addAliasesForSpecies(speciesId: number, chineseName: string | null) {
  if (!chineseName) return;
  // 插入中文别名（去重）
  try {
    db.insert(schema.speciesAliases).values({
      speciesId,
      aliasName: chineseName,
      language: 'zh',
    }).run();
  } catch {
    // 忽略唯一约束冲突
  }
}

export async function processIdentify(sightingId: number, _taskId: number) {
  const sighting = db.select().from(schema.sightings).where(eq(schema.sightings.id, sightingId)).get();
  if (!sighting) throw new Error('sighting not found');

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
  const invalidNames = ['indeterminate', 'unidentifiable', 'unknown', '无法识别', '未能识别'];
  const isValidTop = top
    && top.scientific_name
    && !invalidNames.includes(top.scientific_name.toLowerCase())
    && !invalidNames.includes((top.chinese_name ?? '').toLowerCase());

  if (isValidTop) {
    const matched = findSpeciesByCandidate(top);
    if (matched) {
      speciesId = matched.id;
    } else {
      const inserted = db.insert(schema.species).values({
        scientificName: top!.scientific_name!,
        chineseName: top!.chinese_name ?? null,
        englishName: top!.english_name ?? null,
        orderName: top!.order_name ?? null,
        familyName: top!.family_name ?? null,
        genus: top!.genus ?? null,
        conservation: top!.conservation ?? null,
        bodyLengthCm: top!.body_length_cm ?? null,
        createdVia: 'ai',
      }).returning({ id: schema.species.id }).get();
      speciesId = inserted.id;
      addAliasesForSpecies(speciesId, top!.chinese_name ?? null);
      await tryGenerateDescription(speciesId, top!.scientific_name!, top!.chinese_name ?? '');
    }
    speciesName = top!.chinese_name ?? top!.scientific_name ?? null;
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