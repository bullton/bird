import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { projectRoot } from '../db/client.js';

export interface LocalBird {
  id: number;
  speciesCode: string;
  scientificName: string;
  chineseName: string;
  englishName: string;
  orderName: string;
  familyName: string;
  genus: string;
  conservation: string | null;
  bodyLengthCm: number | null;
}

interface BirdsDB {
  version: string;
  species: LocalBird[];
}

let cached: LocalBird[] | null = null;

function loadBirdsDB(): LocalBird[] {
  if (cached) return cached;
  const path = resolve(projectRoot, 'server', 'data', 'birds.json');
  const raw = readFileSync(path, 'utf-8');
  const db = JSON.parse(raw) as BirdsDB;
  cached = db.species;
  return cached;
}

export function findLocalBirdBySciName(sciName: string): LocalBird | null {
  const birds = loadBirdsDB();
  const normalized = sciName.trim().toLowerCase();
  return birds.find(b => b.scientificName.toLowerCase() === normalized) ?? null;
}

export function findLocalBirdByChineseName(chineseName: string): LocalBird | null {
  const birds = loadBirdsDB();
  return birds.find(b => b.chineseName === chineseName) ?? null;
}

export function findLocalBirdBySciOrChinese(sciName: string, chineseName?: string): LocalBird | null {
  return findLocalBirdBySciName(sciName) ?? (chineseName ? findLocalBirdByChineseName(chineseName) : null);
}

export type LockableField = 'chineseName' | 'englishName' | 'orderName' | 'familyName' | 'genus' | 'conservation' | 'bodyLengthCm';

export function getLockedFieldsFromLocalBird(local: LocalBird): LockableField[] {
  const locked: LockableField[] = [];
  if (local.chineseName) locked.push('chineseName');
  if (local.englishName) locked.push('englishName');
  if (local.orderName) locked.push('orderName');
  if (local.familyName) locked.push('familyName');
  if (local.genus) locked.push('genus');
  if (local.conservation) locked.push('conservation');
  if (local.bodyLengthCm) locked.push('bodyLengthCm');
  return locked;
}