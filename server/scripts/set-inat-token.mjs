import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Try to find JWT_SECRET by reading .env or process env
let SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  try {
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf-8');
      const m = envContent.match(/JWT_SECRET\s*=\s*(.+)/);
      if (m) SECRET = m[1].trim();
    }
  } catch {}
}
if (!SECRET) {
  console.error('JWT_SECRET not set in env or .env');
  process.exit(1);
}

const db = new Database('../data/birdlog.db');

function encrypt(plain) {
  const key = crypto.createHash('sha256').update(SECRET).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return 'enc1:' + Buffer.concat([iv, tag, enc]).toString('base64');
}

const TOKEN = "eyJhbGciOiJIUzUxMiJ9.eyJ1c2VyX2lkIjoxMDc5MDY2NCwiZXhwIjoxNzg5Nzc2ODYxfQ.SlFiybtHRWYC5ZYB7Kf0ZEIB5voMo3A4iYkQxGSfJE4e02OVv4E2cwY7H4h0LK6PNwA5yDRlgpPqHPrp0Zyveg";

const encrypted = encrypt(TOKEN);
console.log('Encrypted length:', encrypted.length);

const existing = db.prepare('SELECT * FROM settings WHERE key = ?').get('inat_api_token');
if (existing) {
  db.prepare('UPDATE settings SET value = ?, updated_at = datetime(\'now\') WHERE key = ?').run(encrypted, 'inat_api_token');
  console.log('Updated existing inat_api_token');
} else {
  db.prepare('INSERT INTO settings (key, value, is_secret, updated_at) VALUES (?, ?, 1, datetime(\'now\'))').run('inat_api_token', encrypted);
  console.log('Inserted new inat_api_token');
}

const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('inat_api_token');
console.log('Stored successfully. Length:', row.value.length);

db.close();