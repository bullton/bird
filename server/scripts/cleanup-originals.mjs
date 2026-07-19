// 一键清理：删除 originals 目录 + 已识别成功的 AI 图片
// 用法：node scripts/cleanup-originals.cjs
import 'dotenv/config';
import Database from 'better-sqlite3';
import { unlink, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, '..', '..', 'data', 'birdlog.db');
const photosDir = process.env.BIRDLOG_PHOTOS_DIR
  ? path.resolve(process.env.BIRDLOG_PHOTOS_DIR)
  : path.resolve(__dirname, '..', '..', 'data', 'photos');

const db = new Database(dbPath);

console.log('Cleaning up originals and AI images...');

// 1. DB: 清空 path_original
const upd1 = db.prepare("UPDATE sightings SET path_original = '' WHERE path_original != ''").run();
console.log('  DB: cleared path_original on', upd1.changes, 'rows');

// 2. 删除已识别成功的记录对应的 AI 图
const successRows = db.prepare(
  "SELECT id, path_ai FROM sightings WHERE path_ai != '' AND status IN ('confirmed', 'corrected')"
).all();
console.log('  Found', successRows.length, 'confirmed records with AI images');
let deleted = 0;
for (const row of successRows) {
  const abs = path.resolve(photosDir, row.path_ai);
  try {
    await unlink(abs);
    db.prepare("UPDATE sightings SET path_ai = '' WHERE id = ?").run(row.id);
    deleted++;
  } catch (e) {
    if (e.code !== 'ENOENT') console.warn('  Warning:', row.path_ai, e.message);
  }
}
console.log('  Deleted', deleted, 'AI images');

// 3. 清空整个 originals 目录
const originalsDir = path.join(photosDir, 'originals');
if (existsSync(originalsDir)) {
  const files = (await readdir(originalsDir)).filter(f => f !== '.gitkeep');
  for (const f of files) {
    try { await unlink(path.join(originalsDir, f)); } catch {}
  }
  console.log('  Removed', files.length, 'files from originals/');
}

db.close();
console.log('Done.');