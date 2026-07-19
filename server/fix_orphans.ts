import { db, schema } from './src/db/client.js';
import { eq, sql, isNotNull } from 'drizzle-orm';

// Find sightings with speciesId pointing to deleted species
const sightings = db.select({
  id: schema.sightings.id,
  speciesId: schema.sightings.speciesId,
}).from(schema.sightings).all();

console.log('Checking orphaned sightings...');
for (const s of sightings) {
  if (s.speciesId !== null) {
    const sp = db.select({ id: schema.species.id })
      .from(schema.species)
      .where(eq(schema.species.id, s.speciesId))
      .get();
    if (!sp) {
      console.log(`  Sighting ${s.id} has orphaned speciesId=${s.speciesId} - clearing it`);
      db.update(schema.sightings)
        .set({ speciesId: null, status: 'failed' })
        .where(eq(schema.sightings.id, s.id))
        .run();
    }
  }
}

console.log('Done');
