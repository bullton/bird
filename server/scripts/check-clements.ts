import XLSX from 'xlsx';

const clementsFile = 'D:/Code/Bird/server/data/Clements_v2025-October-2025.xlsx';
const wb = XLSX.readFile(clementsFile);
const sheetName = wb.SheetNames[0];
const sheet = wb.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];

// 找到第一行有 "species" 的数据行（不是表头）
for (let i = 0; i < Math.min(20, data.length); i++) {
  const row = data[i];
  console.log(`\n--- Row ${i} ---`);
  for (let j = 0; j < Math.min(20, row.length); j++) {
    if (row[j] !== undefined && row[j] !== 'undefined') {
      console.log(`  col ${j}: "${row[j]}"`);
    }
  }
}
