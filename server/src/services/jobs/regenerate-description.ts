import { db, schema } from '../../db/client.js';
import { eq } from 'drizzle-orm';
import { callGenerateDescription } from '../ai-client.js';

export async function processRegenerateDescription(sightingId: number, _taskId: number) {
  const sighting = db.select().from(schema.sightings).where(eq(schema.sightings.id, sightingId)).get();
  if (!sighting) throw new Error('sighting not found');
  if (!sighting.speciesId) throw new Error('sighting has no species');

  const species = db.select().from(schema.species).where(eq(schema.species.id, sighting.speciesId)).get();
  if (!species) throw new Error('species not found');

  const desc = await callGenerateDescription(
    species.scientificName,
    species.chineseName ?? ''
  );

  db.update(schema.species).set({
    description: desc.description,
    habitat: desc.habitat ?? null,
    diet: desc.diet ?? null,
    distribution: desc.distribution ?? null,
    updatedAt: new Date().toISOString(),
  }).where(eq(schema.species.id, species.id)).run();

  console.log(`[describe] regenerated for species ${species.id} (${species.scientificName})`);
}