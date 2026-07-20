import { db, schema } from '../../db/client.js';
import { eq } from 'drizzle-orm';
import { callGenerateDescription } from '../ai-client.js';

function isLatinName(s: string | null | undefined): boolean {
  return !!s && /^[A-Za-z][A-Za-z\s.\-]+$/.test(s.trim());
}

export async function processRegenerateDescription(sightingId: number, _taskId: number) {
  const sighting = db.select().from(schema.sightings).where(eq(schema.sightings.id, sightingId)).get();
  if (!sighting) throw new Error('sighting not found');
  if (!sighting.speciesId) throw new Error('sighting has no species');

  const species = db.select().from(schema.species).where(eq(schema.species.id, sighting.speciesId)).get();
  if (!species) throw new Error('species not found');

  const sciInput = isLatinName(species.scientificName) ? species.scientificName : '';
  const cnInput = species.chineseName ?? (!isLatinName(species.scientificName) ? species.scientificName : '');
  const queryInput = sciInput || cnInput || species.scientificName;

  const desc = await callGenerateDescription(queryInput, cnInput || queryInput);

  const newSci = (desc.scientific_name && desc.scientific_name.trim()) || species.scientificName;
  const newCn = (desc.chinese_name && desc.chinese_name.trim()) || species.chineseName || species.scientificName;

  db.update(schema.species).set({
    scientificName: newSci,
    chineseName: newCn,
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
    updatedAt: new Date().toISOString(),
  }).where(eq(schema.species.id, species.id)).run();

  console.log(`[describe] regenerated for species ${species.id} (${newSci})`);
}