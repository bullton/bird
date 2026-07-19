import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import * as schema from './schema.js';

// Re-export projectRoot from config for convenience
export { projectRoot } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = import.meta.dirname ?? path.dirname(__filename);

function findProjectRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    const pkg = path.join(dir, 'package.json');
    if (existsSync(pkg)) {
      try {
        const data = JSON.parse(require('node:fs').readFileSync(pkg, 'utf-8'));
        if (data.name === 'birdlog-server') return path.dirname(dir);
      } catch {}
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(__dirname, '..', '..');
}

mkdirSync(dirname(config.dbPath), { recursive: true });

export const sqlite = new Database(config.dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('busy_timeout = 5000');
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('synchronous = NORMAL');

export const db = drizzle(sqlite, { schema });
export { schema };
export type DB = typeof db;