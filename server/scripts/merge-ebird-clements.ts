import XLSX from 'xlsx';
import { writeFileSync } from 'node:fs';

const ebirdFile = 'D:/Code/Bird/server/data/eBird_Taxonomy_v2025_5-tab_30Oct2025.xlsx';
const clementsFile = 'D:/Code/Bird/server/data/Clements_v2025-October-2025.xlsx';

// 读取 eBird 中文对照表
const ebirdWB = XLSX.readFile(ebirdFile);
const ebirdSheet = ebirdWB.SheetNames[0];
const ebirdRaw = XLSX.utils.sheet_to_json(ebirdWB.Sheets[ebirdSheet], { header: 1 }) as unknown[][];

const ebirdHeader = ebirdRaw[0] as string[];
const chineseIdx = ebirdHeader.findIndex((h: string) => h.toLowerCase().includes('chinese') && h.toLowerCase().includes('simple'));
const sciNameIdx = ebirdHeader.findIndex((h: string) => h === 'sci_name');
const codeIdx = ebirdHeader.findIndex((h: string) => h === 'species_code');

console.log(`eBird: chineseIdx=${chineseIdx}, sciNameIdx=${sciNameIdx}, codeIdx=${codeIdx}`);

// 按 sci_name 建立映射（key 用标准化学名：单词小写+二名法部分）
const ebirdBySci = new Map<string, { code: string; sciName: string; chineseName: string }>();
for (let i = 1; i < ebirdRaw.length; i++) {
  const row = ebirdRaw[i] as (string | undefined)[];
  const sciRaw = (row[sciNameIdx] as string || '').trim();
  const cn = (row[chineseIdx] as string || '').trim();
  const code = (row[codeIdx] as string) || '';
  if (!sciRaw || !cn) continue;
  // 跳过杂交种等
  if (sciRaw.includes('/') || sciRaw.includes(' x ')) continue;
  const sciNorm = sciRaw.toLowerCase().split(' ').slice(0, 2).join(' ');
  if (!ebirdBySci.has(sciNorm)) {
    ebirdBySci.set(sciNorm, { code, sciName: sciRaw, chineseName: cn });
  }
}
console.log('eBird unique sci names (normalized, with CN):', ebirdBySci.size);

// 读取 Clements 数据
const clementsWB = XLSX.readFile(clementsFile);
const clementsSheet = clementsWB.SheetNames[0];
const clementsRaw = XLSX.utils.sheet_to_json(clementsWB.Sheets[clementsSheet], { header: 1 }) as unknown[][];

const C_CODE = 1;
const C_CAT = 5;
const C_EN = 6;
const C_SCI = 7;
const C_ORDER = 11;
const C_FAMILY = 12;

// 构建 scientific_name -> clements 数据（用 normalized key）
const clementsBySci = new Map<string, { code: string; en: string; order: string; family: string }>();
for (let i = 2; i < clementsRaw.length; i++) {
  const row = clementsRaw[i] as (string | undefined)[];
  const cat = row[C_CAT];
  if (cat !== 'species') continue;
  const sciRaw = (row[C_SCI] as string || '').trim();
  if (!sciRaw) continue;
  const sciNorm = sciRaw.toLowerCase().split(' ').slice(0, 2).join(' ');
  if (!clementsBySci.has(sciNorm)) {
    clementsBySci.set(sciNorm, {
      code: row[C_CODE] || '',
      en: row[C_EN] || '',
      order: row[C_ORDER] || '',
      family: row[C_FAMILY] || '',
    });
  }
}
console.log('Clements species (normalized):', clementsBySci.size);

// 调试：检查几个 key
const testKeys = ['struthio camelus', 'casuarius casuarius', 'dendrocygna javanica'];
for (const k of testKeys) {
  console.log(`  ${k}: ebird=${ebirdBySci.has(k)}, clements=${clementsBySci.has(k)}`);
}

// 通过 sci_name 匹配
const merged: Record<string, unknown>[] = [];
let idx = 1;

for (const [sciNorm, ebirdInfo] of ebirdBySci) {
  const clements = clementsBySci.get(sciNorm);
  if (!clements) continue;

  merged.push({
    id: idx++,
    speciesCode: ebirdInfo.code,
    scientificName: ebirdInfo.sciName,
    chineseName: ebirdInfo.chineseName,
    englishName: clements.en,
    orderName: clements.order || null,
    familyName: clements.family || null,
    genus: null,
    conservation: null,
    bodyLengthCm: null,
  });
}

console.log('Matched by sci_name:', merged.length);
console.log('Sample:', JSON.stringify(merged.slice(0, 5), null, 2));

writeFileSync('D:/Code/Bird/server/data/ebird_species.json', JSON.stringify(merged, null, 2), 'utf-8');
console.log('Saved to ebird_species.json');
