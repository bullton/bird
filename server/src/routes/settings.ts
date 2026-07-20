import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db, schema } from '../db/client.js';
import { eq } from 'drizzle-orm';
import { encrypt, decrypt, isEncrypted } from '../utils/crypto.js';
import { config } from '../config.js';
import { callGenerateDescription } from '../services/ai-client.js';

const SETTING_WHITELIST = new Set([
  'ai_provider',
  'ai_api_key',
  'ai_base_url',
  'ai_model',
  'ai_timeout_ms',
  'ai_temperature',
  'ai_max_retries',
  'allow_registration',
  'upload_max_mb',
  'site_name',
]);

const updateSettingSchema = z.object({
  value: z.string(),
});

export async function settingsRoutes(app: FastifyInstance) {
  app.get('/api/settings', { preHandler: app.requireAdmin }, async () => {
    const rows = db.select().from(schema.settings).all();
    return rows.map((r) => ({
      key: r.key,
      isSecret: !!r.isSecret,
      hasValue: !!r.value,
      masked: r.isSecret && r.value ? maskValue(decryptIfNeeded(r.value)) : r.value ?? '',
      updatedAt: r.updatedAt,
    }));
  });

  app.put<{ Params: { key: string } }>('/api/settings/:key', { preHandler: app.requireAdmin }, async (req, reply) => {
    const key = req.params.key;
    if (!SETTING_WHITELIST.has(key)) return reply.code(400).send({ error: '不允许修改该设置' });
    const parsed = updateSettingSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid input' });

    const row = db.select().from(schema.settings).where(eq(schema.settings.key, key)).get();
    if (!row) return reply.code(404).send({ error: 'Not found' });
    const isSecret = !!row.isSecret;
    const valueToStore = (isSecret && parsed.data.value)
      ? encrypt(parsed.data.value)
      : parsed.data.value;

    db.update(schema.settings).set({
      value: valueToStore,
      updatedBy: req.authUser!.id,
      updatedAt: new Date().toISOString(),
    }).where(eq(schema.settings.key, key)).run();

    return { ok: true };
  });

  app.get('/api/settings/public', async () => {
    const rows = db.select().from(schema.settings).all();
    const out: Record<string, string> = {};
    for (const r of rows) {
      if (r.isSecret) continue;
      out[r.key] = r.value ?? '';
    }
    return out;
  });

  app.post('/api/admin/fix-species', { preHandler: app.requireAdmin }, async (req, reply) => {
    const allSpecies = db.select().from(schema.species).all();
    let fixed = 0;
    let errors = 0;
    for (const sp of allSpecies) {
      try {
        const desc = await callGenerateDescription(sp.scientificName, sp.chineseName ?? sp.scientificName);
        db.update(schema.species).set({
          orderName: desc.order_name,
          familyName: desc.family_name,
          genus: desc.genus,
          conservation: desc.conservation,
          bodyLengthCm: desc.body_length_cm,
          description: desc.description,
          habitat: desc.habitat,
          diet: desc.diet,
          distribution: desc.distribution,
          englishName: desc.english_name,
          updatedAt: new Date().toISOString(),
        }).where(eq(schema.species.id, sp.id)).run();
        fixed++;
      } catch (e) {
        errors++;
        console.error(`Failed to fix species ${sp.id} (${sp.scientificName}):`, e);
      }
    }
    return { ok: true, fixed, errors, total: allSpecies.length };
  });
}

function maskValue(v: string): string {
  if (!v) return '';
  if (v.length <= 8) return '****';
  return v.slice(0, 4) + '****' + v.slice(-4);
}

function decryptIfNeeded(v: string): string {
  return isEncrypted(v) ? decrypt(v) : v;
}