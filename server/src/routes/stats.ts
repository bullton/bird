import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db/client.js';
import { and, eq, isNull, sql } from 'drizzle-orm';

export async function statsRoutes(app: FastifyInstance) {
  app.get('/api/stats/summary', async () => {
    const total = db.select({ c: sql<number>`count(*)` }).from(schema.sightings)
      .where(isNull(schema.sightings.deletedAt)).get()?.c ?? 0;
    const speciesCount = db.select({ c: sql<number>`count(DISTINCT ${schema.sightings.speciesId})` }).from(schema.sightings)
      .where(and(
        isNull(schema.sightings.deletedAt),
        sql`${schema.sightings.status} IN ('confirmed', 'corrected')`,
        sql`${schema.sightings.speciesId} IS NOT NULL`,
      )).get()?.c ?? 0;
    const identified = db.select({ c: sql<number>`count(*)` }).from(schema.sightings)
      .where(and(
        isNull(schema.sightings.deletedAt),
        sql`${schema.sightings.status} IN ('confirmed', 'corrected')`,
      )).get()?.c ?? 0;
    const pending = db.select({ c: sql<number>`count(*)` }).from(schema.sightings)
      .where(and(
        isNull(schema.sightings.deletedAt),
        eq(schema.sightings.status, 'pending'),
      )).get()?.c ?? 0;
    const failed = db.select({ c: sql<number>`count(*)` }).from(schema.sightings)
      .where(and(
        isNull(schema.sightings.deletedAt),
        eq(schema.sightings.status, 'failed'),
      )).get()?.c ?? 0;
    const userCount = db.select({ c: sql<number>`count(*)` }).from(schema.users).get()?.c ?? 0;
    return { totalSightings: total, speciesCount, identified, pending, failed, userCount };
  });

  app.get('/api/stats/timeline', async (req) => {
    const q = (req.query as any).year ? parseInt((req.query as any).year, 10) : new Date().getFullYear();
    const yearStr = String(q);
    const rows = db.select({
      month: sql<string>`substr(${schema.sightings.takenAt}, 1, 7)`,
      count: sql<number>`count(*)`,
    }).from(schema.sightings)
      .where(and(
        isNull(schema.sightings.deletedAt),
        sql`substr(${schema.sightings.takenAt}, 1, 4) = ${yearStr}`,
      ))
      .groupBy(sql`substr(${schema.sightings.takenAt}, 1, 7)`)
      .all();
    return rows;
  });

  app.get('/api/stats/family-distribution', async () => {
    const rows = db.select({
      familyName: schema.species.familyName,
      orderName: schema.species.orderName,
      count: sql<number>`count(${schema.sightings.id})`,
    })
      .from(schema.sightings)
      .innerJoin(schema.species, eq(schema.sightings.speciesId, schema.species.id))
      .where(isNull(schema.sightings.deletedAt))
      .groupBy(schema.species.familyName, schema.species.orderName)
      .all();
    return rows.filter((r) => r.familyName).sort((a, b) => b.count - a.count);
  });

  app.get('/api/stats/top-species', async () => {
    const rows = db.select({
      speciesId: schema.sightings.speciesId,
      scientificName: schema.species.scientificName,
      chineseName: schema.species.chineseName,
      englishName: schema.species.englishName,
      familyName: schema.species.familyName,
      count: sql<number>`count(*)`,
    })
      .from(schema.sightings)
      .innerJoin(schema.species, eq(schema.sightings.speciesId, schema.species.id))
      .where(isNull(schema.sightings.deletedAt))
      .groupBy(schema.sightings.speciesId)
      .orderBy(sql`count(*) desc`)
      .limit(20)
      .all();
    return rows;
  });
}