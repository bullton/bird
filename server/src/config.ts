import 'dotenv/config';
import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Find project root: walk up from server/src to find package.json with birdlog-server
function findProjectRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    if (existsSync(path.join(dir, 'package.json')) && existsSync(path.join(dir, '..', 'package.json'))) {
      return path.dirname(dir);
    }
    dir = path.dirname(dir);
  }
  return path.resolve(__dirname, '..', '..');
}

export const projectRoot = findProjectRoot();

// Load .env from project root if not already loaded
const envPath = path.join(projectRoot, '.env');
if (existsSync(envPath)) {
  dotenvConfig({ path: envPath, override: false });
}

function required(key: string, fallback?: string): string {
  const v = process.env[key] ?? fallback;
  if (!v) throw new Error(`Missing env: ${key}`);
  return v;
}

function int(key: string, fallback: number): number {
  const v = process.env[key];
  if (!v) return fallback;
  const n = parseInt(v, 10);
  if (isNaN(n)) throw new Error(`Invalid integer for ${key}: ${v}`);
  return n;
}

function resolvePath(p: string): string {
  if (!p) return '';
  return path.isAbsolute(p) ? p : path.resolve(projectRoot, p);
}

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: int('PORT', 3000),
  host: process.env.BIRDLOG_HOST || '0.0.0.0',
  jwtSecret: required('JWT_SECRET', 'dev-secret-change-me'),
  dataDir: resolvePath(process.env.BIRDLOG_DATA_DIR || './data'),
  dbPath: resolvePath(process.env.BIRDLOG_DB || './data/birdlog.db'),
  photosDir: resolvePath(process.env.BIRDLOG_PHOTOS_DIR || './data/photos'),
  staticDir: resolvePath(process.env.BIRDLOG_STATIC_DIR || ''),
  ai: {
    baseUrl: process.env.AI_BASE_URL || 'https://api.minimaxi.com',
    model: process.env.AI_MODEL || 'MiniMax-M3',
    timeoutMs: int('AI_TIMEOUT_MS', 30000),
  },
  taskWorkers: int('TASK_WORKERS', 3),
  uploadMaxBytes: int('UPLOAD_MAX_BYTES', 30 * 1024 * 1024),
  siteName: process.env.SITE_NAME || '家庭鸟类图鉴',
  isProd: (process.env.NODE_ENV || 'development') === 'production',
};