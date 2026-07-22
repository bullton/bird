import { sqlite } from '../db/client.js';

const hasColumn = sqlite.prepare("PRAGMA table_info(species)").all() as { name: string }[];

if (!hasColumn.find(c => c.name === 'db_matched_fields')) {
  console.log('Adding db_matched_fields column to species table...');
  sqlite.exec("ALTER TABLE species ADD COLUMN db_matched_fields TEXT NOT NULL DEFAULT '[]'");
  console.log('Done');
} else {
  console.log('db_matched_fields column already exists');
}

console.log('Current columns:', hasColumn.map(c => c.name));