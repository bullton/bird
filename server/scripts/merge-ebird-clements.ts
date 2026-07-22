import XLSX from 'xlsx';
import { writeFileSync } from 'node:fs';

const ebirdFile = 'D:/Code/Bird/server/data/eBird_Taxonomy_v2025_5-tab_30Oct2025.xlsx';
const clementsFile = 'D:/Code/Bird/server/data/Clements_v2025-October-2025.xlsx';

// 读取 eBird 中文对照表（用 header=1 获取原始数组格式）
const ebirdWB = XLSX.readFile(ebirdFile);
const ebirdSheet = ebirdWB.SheetNames[0];
const ebirdRaw = XLSX.utils.sheet_to_json(ebirdWB.Sheets[ebirdSheet], { header: 1 }) as unknown[][];

// eBird 表头行（第0行），species_code 在 col 1，chinese simple 在某个 col
const ebirdHeader = ebirdRaw[0] as string[];
const chineseIdx = ebirdHeader.findIndex((h: string) => h.toLowerCase().includes('chinese') && h.toLowerCase().includes('simple'));
const sciNameIdx = ebirdHeader.findIndex((h: string) => h === 'sci_name');
const codeIdx = ebirdHeader.findIndex((h: string) => h === 'species_code');

console.log(`eBird: chineseIdx=${chineseIdx}, sciNameIdx=${sciNameIdx}, codeIdx=${codeIdx}`);

const ebirdMap = new Map<string, { sci_name: string; chineseName: string }>();
for (let i = 1; i < ebirdRaw.length; i++) {
  const row = ebirdRaw[i] as (string | undefined)[];
  const code = row[codeIdx];
  const cn = row[chineseIdx];
  const sn = row[sciNameIdx];
  if (code && cn && String(cn).trim()) {
    ebirdMap.set(code, { sci_name: sn || '', chineseName: cn });
  }
}
console.log('eBird entries:', ebirdMap.size);

// 读取 Clements 数据
const clementsWB = XLSX.readFile(clementsFile);
const clementsSheet = clementsWB.SheetNames[0];
const clementsRaw = XLSX.utils.sheet_to_json(clementsWB.Sheets[clementsSheet], { header: 1 }) as unknown[][];

// Clements 列映射（从前面分析得知）：
// col 1 = species_code
// col 5 = category
// col 6 = English name
// col 7 = scientific name
// col 11 = order
// col 12 = family
const C_CODE = 1;
const C_CAT = 5;
const C_EN = 6;
const C_SCI = 7;
const C_ORDER = 11;
const C_FAMILY = 12;

// 构建 species_code -> clements 数据的映射（只取 species 类别）
const clementsMap = new Map<string, { sci: string; en: string; order: string; family: string }>();
for (let i = 2; i < clementsRaw.length; i++) {
  const row = clementsRaw[i] as (string | undefined)[];
  const code = row[C_CODE];
  const cat = row[C_CAT];
  if (!code || cat !== 'species') continue;
  clementsMap.set(code, {
    sci: row[C_SCI] || '',
    en: row[C_EN] || '',
    order: row[C_ORDER] || '',
    family: row[C_FAMILY] || '',
  });
}
console.log('Clements species entries:', clementsMap.size);

// 合并
const merged: Record<string, unknown>[] = [];
let idx = 1;

for (const [code, ebirdInfo] of ebirdMap) {
  const clements = clementsMap.get(code);
  if (!clements) continue;

  merged.push({
    id: idx++,
    speciesCode: code,
    scientificName: clements.sci,
    chineseName: ebirdInfo.chineseName,
    englishName: clements.en,
    orderName: clements.order || null,
    familyName: clements.family || null,
    genus: null, // Clements 没有属名
    conservation: null, // Clements 没有 IUCN
    bodyLengthCm: null,
  });
}

console.log('Merged entries:', merged.length);
console.log('Sample:', JSON.stringify(merged.slice(0, 3), null, 2));

writeFileSync('D:/Code/Bird/server/data/ebird_species.json', JSON.stringify(merged, null, 2), 'utf-8');
console.log('Saved to ebird_species.json');
