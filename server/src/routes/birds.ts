import type { FastifyInstance } from 'fastify';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectRoot } from '../db/client.js';

interface Bird {
  id: number;
  chineseName: string;
  englishName: string;
  scientificName: string;
  orderName: string;
  familyName: string;
  genus: string;
  conservation: string;
  bodyLengthCm: number;
}

interface BirdsDB {
  version: string;
  description: string;
  source: string;
  lastUpdated: string;
  species: Bird[];
}

function loadBirdsDB(): BirdsDB {
  const path = resolve(projectRoot, 'server', 'data', 'birds.json');
  const raw = readFileSync(path, 'utf-8');
  return JSON.parse(raw) as BirdsDB;
}

function fuzzyMatch(text: string | null | undefined, pattern: string): boolean {
  if (!pattern) return true;
  if (!text) return false;
  const t = text.toLowerCase();
  const p = pattern.toLowerCase();
  return t.includes(p);
}

export async function birdsRoutes(app: FastifyInstance) {
  app.get('/api/birds-db/info', async () => {
    const db = loadBirdsDB();
    return {
      version: db.version,
      total: db.species.length,
      source: db.source,
      lastUpdated: db.lastUpdated,
    };
  });

  app.get('/api/birds-db/species', async (req) => {
    const q = req.query as { q?: string; family?: string; order?: string; page?: string };
    const page = parseInt(q.page ?? '1', 10);
    const pageSize = 50;

    const db = loadBirdsDB();
    let items = db.species;

    if (q.q) {
      const pattern = q.q.trim();
      items = items.filter(
        (b) =>
          fuzzyMatch(b.chineseName, pattern) ||
          fuzzyMatch(b.englishName, pattern) ||
          fuzzyMatch(b.scientificName, pattern) ||
          fuzzyMatch(b.genus, pattern)
      );
    }

    if (q.family) {
      items = items.filter((b) => b.familyName === q.family);
    }

    if (q.order) {
      items = items.filter((b) => b.orderName === q.order);
    }

    const total = items.length;
    const start = (page - 1) * pageSize;
    const paged = items.slice(start, start + pageSize);

    return { items: paged, total, page, pageSize };
  });

  app.get('/api/birds-db/species/:id', async (req, reply) => {
    const id = parseInt((req.params as { id: string }).id, 10);
    const db = loadBirdsDB();
    const bird = db.species.find((b) => b.id === id);
    if (!bird) return reply.code(404).send({ error: 'Not found' });
    return bird;
  });

  app.get('/api/birds-db/lookup', async (req, reply) => {
    const q = req.query as { name: string };
    if (!q.name) return reply.code(400).send({ error: 'name is required' });

    const db = loadBirdsDB();
    const pattern = q.name.trim();

    const exact = db.species.find(
      (b) =>
        b.chineseName === pattern ||
        b.scientificName.toLowerCase() === pattern.toLowerCase()
    );
    if (exact) return exact;

    const fuzzy = db.species.find(
      (b) =>
        fuzzyMatch(b.chineseName, pattern) ||
        fuzzyMatch(b.englishName, pattern) ||
        fuzzyMatch(b.scientificName, pattern)
    );
    if (fuzzy) return fuzzy;

    return reply.code(404).send({ error: 'No match found' });
  });

  app.get('/api/birds-db/families', async () => {
    const db = loadBirdsDB();
    const map = new Map<string, { orderName: string; count: number }>();
    for (const b of db.species) {
      const existing = map.get(b.familyName);
      if (existing) {
        existing.count++;
      } else {
        map.set(b.familyName, { orderName: b.orderName, count: 1 });
      }
    }
    return Array.from(map.entries())
      .map(([familyName, { orderName, count }]) => ({ familyName, orderName, count }))
      .sort((a, b) => a.familyName.localeCompare(b.familyName));
  });

  app.get('/api/birds-db/orders', async () => {
    const db = loadBirdsDB();
    const set = new Set<string>();
    for (const b of db.species) set.add(b.orderName);
    return Array.from(set).sort();
  });
}