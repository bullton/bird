import 'dotenv/config';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { sqlite, db, projectRoot } from './client.js';
import { settings } from './schema.js';
import { sql } from 'drizzle-orm';

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    avatar_path TEXT,
    role TEXT NOT NULL CHECK (role IN ('admin','member')),
    is_active INTEGER NOT NULL DEFAULT 1,
    must_change_password INTEGER NOT NULL DEFAULT 0,
    settings_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_login_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS species (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scientific_name TEXT NOT NULL UNIQUE,
    chinese_name TEXT,
    english_name TEXT,
    class_name TEXT,
    order_name TEXT,
    family_name TEXT,
    genus TEXT,
    conservation TEXT,
    cites_appendix TEXT,
    description TEXT,
    habitat TEXT,
    diet TEXT,
    distribution TEXT,
    fun_facts TEXT,
    body_length_cm REAL,
    extra_json TEXT NOT NULL DEFAULT '{}',
    created_via TEXT NOT NULL DEFAULT 'ai',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS species_aliases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    species_id INTEGER NOT NULL REFERENCES species(id) ON DELETE CASCADE,
    alias_name TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'zh'
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uniq_alias ON species_aliases(alias_name, language)`,
  `CREATE TABLE IF NOT EXISTS sightings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    species_id INTEGER REFERENCES species(id),
    path_original TEXT NOT NULL DEFAULT '',
    path_main TEXT NOT NULL,
    path_ai TEXT NOT NULL DEFAULT '',
    path_thumb TEXT NOT NULL,
    photo_hash TEXT NOT NULL,
    file_size_bytes INTEGER,
    taken_at TEXT,
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
    lat REAL,
    lng REAL,
    location_name TEXT,
    altitude_m REAL,
    location_source TEXT,
    exif_json TEXT,
    ai_provider TEXT NOT NULL DEFAULT 'minimax',
    ai_request_id TEXT,
    ai_model TEXT,
    identification_json TEXT,
    confidence_max REAL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','corrected','failed')),
    correction_type TEXT,
    user_note TEXT,
    is_favorite INTEGER NOT NULL DEFAULT 0,
    deleted_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_taken ON sightings(taken_at)`,
  `CREATE INDEX IF NOT EXISTS idx_species ON sightings(species_id)`,
  `CREATE INDEX IF NOT EXISTS idx_status ON sightings(status, taken_at)`,
  `CREATE INDEX IF NOT EXISTS idx_hash ON sightings(photo_hash)`,
  `CREATE TABLE IF NOT EXISTS identification_corrections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sighting_id INTEGER NOT NULL REFERENCES sightings(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    predicted_top TEXT,
    corrected_to INTEGER REFERENCES species(id),
    confidence REAL,
    correction_type TEXT,
    comment TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS task_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sighting_id INTEGER NOT NULL REFERENCES sightings(id) ON DELETE CASCADE,
    task_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed')),
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    scheduled_at TEXT NOT NULL DEFAULT (datetime('now')),
    started_at TEXT,
    finished_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_pickup ON task_queue(status, scheduled_at)`,
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    is_secret INTEGER NOT NULL DEFAULT 0,
    updated_by INTEGER REFERENCES users(id),
    updated_at TEXT
  )`,
];

const DEFAULT_SETTINGS: Array<[string, string, number]> = [
  ['ai_provider', 'minimax', 0],
  ['ai_api_key', '', 1],
  ['ai_base_url', process.env.AI_BASE_URL || 'https://api.minimaxi.com', 0],
  ['ai_model', process.env.AI_MODEL || 'MiniMax-M3', 0],
  ['ai_timeout_ms', process.env.AI_TIMEOUT_MS || '30000', 0],
  ['ai_temperature', '0.2', 0],
  ['ai_max_retries', '3', 0],
  ['allow_registration', '1', 0],
  ['upload_max_mb', '30', 0],
  ['site_name', process.env.SITE_NAME || '家庭鸟类图鉴', 0],
];

function migrate() {
  console.log('Running migrations...');
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec('BEGIN');
  try {
    for (const stmt of STATEMENTS) sqlite.exec(stmt);

    // 兼容老库：补 path_ai / path_original DEFAULT 约束
    const cols = sqlite.prepare("PRAGMA table_info('sightings')").all() as Array<{ name: string }>;
    if (cols.length > 0) {
      if (!cols.some((c) => c.name === 'path_ai')) {
        sqlite.exec(`ALTER TABLE sightings ADD COLUMN path_ai TEXT NOT NULL DEFAULT ''`);
        console.log('Added column sightings.path_ai');
      }
      if (!cols.some((c) => c.name === 'path_original')) {
        sqlite.exec(`ALTER TABLE sightings ADD COLUMN path_original TEXT NOT NULL DEFAULT ''`);
        console.log('Added column sightings.path_original');
      }
    }

    // 兼容老库：补 species 新分类字段
    const spCols = sqlite.prepare("PRAGMA table_info('species')").all() as Array<{ name: string }>;
    const addSpCols: Array<[string, string]> = [
      ['class_name', 'TEXT'],
      ['cites_appendix', 'TEXT'],
      ['fun_facts', 'TEXT'],
    ];
    for (const [name, type] of addSpCols) {
      if (!spCols.some((c) => c.name === name)) {
        sqlite.exec(`ALTER TABLE species ADD COLUMN ${name} ${type}`);
        console.log(`Added column species.${name}`);
      }
    }

    for (const [key, value, isSecret] of DEFAULT_SETTINGS) {
      db.insert(settings)
        .values({ key, value, isSecret })
        .onConflictDoNothing()
        .run();
    }
    sqlite.exec('COMMIT');
    console.log('Migrations done.');
  } catch (err) {
    sqlite.exec('ROLLBACK');
    throw err;
  }
}

migrate();