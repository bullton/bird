import XLSX from 'xlsx';
import { readFileSync, writeFileSync } from 'node:fs';

const workbook = XLSX.readFile('D:/Code/Bird/server/data/eBird_Taxonomy_v2025_5-tab_30Oct2025.xlsx');
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(sheet);

console.log('Total rows:', data.length);
console.log('Headers:', Object.keys(data[0] as object).slice(0, 20));

// 查找中文名列
const first = data[0] as Record<string, unknown>;
const chineseKey = Object.keys(first).find(k => k.toLowerCase().includes('chinese') && k.toLowerCase().includes('simple'));
console.log('Chinese column key:', chineseKey);

if (!chineseKey) {
  // 列出所有列名
  console.log('All keys:', Object.keys(first));
  process.exit(1);
}

// 过滤有中文名的行
const withChinese = data.filter((row: Record<string, unknown>) => {
  const val = row[chineseKey];
  return val && String(val).trim().length > 0;
});

console.log('Rows with Chinese name:', withChinese.length);

// 提取需要的字段
const extracted = withChinese.map((row: Record<string, unknown>, idx: number) => {
  const sciName = row['SCI_NAME'] || row['sci_name'] || row['SCIENTIFIC_NAME'] || row['scientific_name'];
  const speciesCode = row['SPECIES_CODE'] || row['species_code'] || row['SPECIES_CODE'];
  const chineseName = row[chineseKey];

  return {
    id: idx + 1,
    speciesCode: speciesCode,
    scientificName: sciName,
    chineseName: chineseName,
  };
}).filter(r => r.scientificName && r.speciesCode);

// 去重（同名保留第一个）
const seen = new Set<string>();
const unique = extracted.filter(r => {
  const key = `${r.chineseName}|${r.scientificName}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

console.log('Unique species:', unique.length);
console.log('Sample:', unique.slice(0, 5));

// 保存到 json 文件
writeFileSync('D:/Code/Bird/server/data/ebird_chinese_simple.json', JSON.stringify(unique, null, 2), 'utf-8');
console.log('Saved to ebird_chinese_simple.json');
