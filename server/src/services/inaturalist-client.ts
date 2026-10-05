// iNaturalist Computer Vision API client
// 文档：https://www.inaturalist.org/pages/api+docs
// 端点：https://api.inaturalist.org/v1/computervision/score_image

import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { decrypt, encrypt, isEncrypted } from '../utils/crypto.js';
import { db, schema } from '../db/client.js';
import { eq } from 'drizzle-orm';

export interface INatTaxon {
  id: number;
  name: string;
  rank: string;
  scientific_name: string;
  preferred_common_name?: string;
  observations_count?: number;
  is_active?: boolean;
  ancestry?: string;
  extinct?: boolean;
  conservation_status?: {
    status: string;
    authority?: string;
  };
  default_photo?: {
    medium_url?: string;
    square_url?: string;
  };
  wikipedia_summary?: string;
  taxon_photos?: Array<{
    photo: {
      medium_url?: string;
      square_url?: string;
    };
  }>;
}

export interface INatCandidate {
  taxon: INatTaxon;
  vision_score: number;
  combined_score: number;
  frequency_score?: number;
  geo_score?: number;
  rank?: number;
}

export interface INatResponse {
  results: INatCandidate[];
  total_results?: number;
}

export interface INatResult {
  scientific_name: string;
  common_name: string;
  rank: string;
  vision_score: number;
  combined_score: number;
  order?: string;
  family?: string;
  genus?: string;
  iucn_status?: string;
  extinct?: boolean;
  observations_count?: number;
  default_photo_url?: string;
  wikipedia_summary?: string;
  taxon_id?: number;
}

export interface CallOptions {
  /** 纬度，用于地理加权（可选） */
  lat?: number;
  /** 经度，用于地理加权（可选） */
  lng?: number;
  /** 时间戳（可选） */
  observed_on?: string;
  /** GeoNames place_id（可选，可提升地理加权准确度） */
  place_id?: number;
  /** iNaturalist JWT token (必需 - iNaturalist vision API 需要认证) */
  apiToken?: string;
}

const API_URL = 'https://api.inaturalist.org/v1/computervision/score_image';
const TAXON_URL = (id: number) => `https://api.inaturalist.org/v1/taxa/${id}`;

function parseConservation(taxon: INatTaxon): string | undefined {
  return taxon.conservation_status?.status;
}

function extractPhotoUrl(taxon: INatTaxon): string | undefined {
  return taxon.default_photo?.medium_url ?? taxon.default_photo?.square_url;
}

/**
 * 用纯 Node.js Buffer 构建 multipart/form-data 请求体
 */
function buildMultipart(
  fields: Record<string, string>,
  fileField: { name: string; filename: string; contentType: string; data: Buffer }
): { body: Buffer; boundary: string; contentType: string } {
  const boundary = '----BirdLogBoundary' + Math.random().toString(36).slice(2);
  const parts: Buffer[] = [];

  for (const [key, value] of Object.entries(fields)) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="${key}"\r\n` +
        `\r\n` +
        `${value}\r\n`
      )
    );
  }

  parts.push(
    Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${fileField.name}"; filename="${fileField.filename}"\r\n` +
      `Content-Type: ${fileField.contentType}\r\n` +
      `\r\n`
    )
  );
  parts.push(fileField.data);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

  return {
    body: Buffer.concat(parts),
    boundary,
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}



/**
 * 获取分类详情（含祖先信息：目、科、属）
 */
export async function fetchTaxonDetails(taxonId: number): Promise<{
  order?: string;
  family?: string;
  genus?: string;
  scientific_name?: string;
  common_name?: string;
} | null> {
  try {
    const res = await fetch(TAXON_URL(taxonId), {
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) return null;
    const taxon = (await res.json()) as { results: INatTaxon[] };
    const t = taxon.results?.[0];
    if (!t) return null;

    const ancestors = (t as any).ancestors as Array<{ rank: string; name: string }> | undefined;
    let order: string | undefined;
    let family: string | undefined;
    let genus: string | undefined;

    if (Array.isArray(ancestors)) {
      for (const a of ancestors) {
        if (a.rank === 'order') order = a.name;
        else if (a.rank === 'family') family = a.name;
        else if (a.rank === 'genus') genus = a.name;
      }
    }

    return {
      order,
      family,
      genus,
      scientific_name: t.scientific_name ?? t.name,
      common_name: t.preferred_common_name ?? t.name,
    };
  } catch {
    return null;
  }
}

export interface IdentifyCandidate {
  scientific_name: string;
  chinese_name?: string;
  english_name?: string;
  order_name?: string;
  family_name?: string;
  genus?: string;
  conservation?: string;
  body_length_cm?: number;
  confidence: number;
  vision_score?: number;
  observations_count?: number;
  photo_url?: string;
  wikipedia_summary?: string;
  taxon_id?: number;
  extinct?: boolean;
}

export interface IdentifyResult {
  candidates: IdentifyCandidate[];
  model: string;
  requestId: string;
}

async function smartCropImage(imageBuffer: Buffer, targetSize = 800): Promise<Buffer> {
  const meta = await sharp(imageBuffer, { failOn: 'none' }).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (!w || !h) throw new Error('INVALID_IMAGE');

  const aspect = w / h;
  let cropW: number;
  let cropH: number;
  if (aspect >= 1) {
    cropH = h;
    cropW = Math.round(h * 1);
  } else {
    cropW = w;
    cropH = Math.round(w * 1);
  }
  const x = Math.max(0, Math.round((w - cropW) / 2));
  const y = Math.max(0, Math.round((h - cropH) / 2));

  const out = await sharp(imageBuffer, { failOn: 'none' })
    .extract({ left: x, top: y, width: Math.min(cropW, w), height: Math.min(cropH, h) })
    .resize(targetSize, targetSize, { fit: 'cover' })
    .jpeg({ quality: 90 })
    .toBuffer();

  return out;
}

export async function identifyImage(
  imageBuffer: Buffer,
  options: CallOptions & { withTaxonomy?: boolean }
): Promise<IdentifyResult> {
  const apiToken = options.apiToken;
  if (!apiToken) {
    throw new Error('iNaturalist API token 未配置');
  }

  const cropped = await smartCropImage(imageBuffer);

  const results = await callINaturalist(cropped, options, {
    onRefresh: async () => {
      const newToken = await refreshToken();
      if (!newToken) throw new Error('Token 过期且无法自动刷新，请更新 iNaturalist Token');
      return newToken;
    },
  });

  let taxonomyMap: Map<number, { order?: string; family?: string; genus?: string }> = new Map();
  if (options.withTaxonomy !== false && results.length > 0) {
    const top = results.slice(0, 3);
    await Promise.all(
      top.map(async (r) => {
        if (!r.taxon_id) return;
        const details = await fetchTaxonDetails(r.taxon_id);
        if (details) taxonomyMap.set(r.taxon_id, details);
      })
    );
  }

  const candidates: IdentifyCandidate[] = results.slice(0, 5).map((r) => {
    const tax = r.taxon_id ? taxonomyMap.get(r.taxon_id) : undefined;
    return {
      scientific_name: r.scientific_name,
      chinese_name: r.common_name,
      english_name: r.common_name,
      order_name: tax?.order,
      family_name: tax?.family,
      genus: tax?.genus,
      conservation: r.iucn_status,
      body_length_cm: undefined,
      confidence: r.combined_score,
      vision_score: r.vision_score,
      observations_count: r.observations_count,
      photo_url: r.default_photo_url,
      wikipedia_summary: r.wikipedia_summary,
      taxon_id: r.taxon_id,
      extinct: r.extinct,
    };
  });

  return {
    candidates,
    model: 'iNaturalist CV',
    requestId: `inat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
  };
}

interface RefreshOptions {
  onRefresh?: () => Promise<string>;
}

async function callINaturalistWithRetry(
  imageBuffer: Buffer,
  options: CallOptions,
  refreshOpts?: RefreshOptions
): Promise<INatResult[]> {
  const fields: Record<string, string> = {};
  if (options.lat !== undefined) fields.lat = String(options.lat);
  if (options.lng !== undefined) fields.lng = String(options.lng);
  if (options.observed_on) fields.observed_on = options.observed_on;
  if (options.place_id !== undefined) fields.place_id = String(options.place_id);

  const { body, contentType } = buildMultipart(fields, {
    name: 'image',
    filename: 'bird.jpg',
    contentType: 'image/jpeg',
    data: imageBuffer,
  });

  const apiToken = options.apiToken!;

  const res = await fetch(API_URL, {
    method: 'POST',
    body,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(body.length),
      'Authorization': `Bearer ${apiToken}`,
      'User-Agent': 'BirdLog/1.0 (https://github.com/bullton/bird)',
    },
  });

  if (res.status === 401 && refreshOpts?.onRefresh) {
    console.log('[iNaturalist] Token expired, attempting auto-refresh...');
    const newToken = await refreshOpts.onRefresh();
    if (newToken) {
      options.apiToken = newToken;
      return callINaturalistWithRetry(imageBuffer, options, refreshOpts);
    }
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`iNaturalist API ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as INatResponse;
  const results = Array.isArray(data.results) ? data.results : [];

  return results
    .filter((r) => r.taxon && r.taxon.rank === 'species' && r.taxon.is_active !== false)
    .map((r) => ({
      scientific_name: r.taxon.scientific_name ?? r.taxon.name,
      common_name: r.taxon.preferred_common_name ?? r.taxon.name,
      rank: r.taxon.rank,
      vision_score: r.vision_score,
      combined_score: r.combined_score,
      iucn_status: parseConservation(r.taxon),
      extinct: r.taxon.extinct,
      observations_count: r.taxon.observations_count,
      default_photo_url: extractPhotoUrl(r.taxon),
      wikipedia_summary: r.taxon.wikipedia_summary,
      taxon_id: r.taxon.id,
    }));
}

export async function callINaturalist(
  imageBuffer: Buffer,
  options: CallOptions = {},
  refreshOpts?: RefreshOptions
): Promise<INatResult[]> {
  if (!options.apiToken) {
    throw new Error('iNaturalist API token 未配置。请在系统设置中填写 (ai_api_token) 或环境变量 INAT_API_TOKEN');
  }

  if (refreshOpts) {
    return callINaturalistWithRetry(imageBuffer, options, refreshOpts);
  }

  const fields: Record<string, string> = {};
  if (options.lat !== undefined) fields.lat = String(options.lat);
  if (options.lng !== undefined) fields.lng = String(options.lng);
  if (options.observed_on) fields.observed_on = options.observed_on;
  if (options.place_id !== undefined) fields.place_id = String(options.place_id);

  const { body, contentType } = buildMultipart(fields, {
    name: 'image',
    filename: 'bird.jpg',
    contentType: 'image/jpeg',
    data: imageBuffer,
  });

  const res = await fetch(API_URL, {
    method: 'POST',
    body,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(body.length),
      'Authorization': `Bearer ${options.apiToken}`,
      'User-Agent': 'BirdLog/1.0 (https://github.com/bullton/bird)',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`iNaturalist API ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as INatResponse;
  const results = Array.isArray(data.results) ? data.results : [];

  return results
    .filter((r) => r.taxon && r.taxon.rank === 'species' && r.taxon.is_active !== false)
    .map((r) => ({
      scientific_name: r.taxon.scientific_name ?? r.taxon.name,
      common_name: r.taxon.preferred_common_name ?? r.taxon.name,
      rank: r.taxon.rank,
      vision_score: r.vision_score,
      combined_score: r.combined_score,
      iucn_status: parseConservation(r.taxon),
      extinct: r.taxon.extinct,
      observations_count: r.taxon.observations_count,
      default_photo_url: extractPhotoUrl(r.taxon),
      wikipedia_summary: r.taxon.wikipedia_summary,
      taxon_id: r.taxon.id,
    }));
}

interface Credentials {
  username: string;
  password: string;
}

async function loadCredentials(): Promise<Credentials | null> {
  // Try .inat-credentials file first
  const credPaths = [
    resolve(process.cwd(), '.inat-credentials'),
    resolve(process.cwd(), 'server', '.inat-credentials'),
    resolve(__dirname, '..', '.inat-credentials'),
  ];

  for (const credPath of credPaths) {
    try {
      const content = await readFile(credPath, 'utf-8');
      const lines = content.split('\n');
      let username = '';
      let password = '';
      for (const line of lines) {
        const [key, ...rest] = line.split('=');
        if (!key || !rest.length) continue;
        const value = rest.join('=').trim();
        if (key.trim() === 'username') username = value;
        if (key.trim() === 'password') password = value;
      }
      if (username && password) {
        console.log('[iNaturalist] Loaded credentials from', credPath);
        return { username, password };
      }
    } catch {
      // File doesn't exist, try next path
    }
  }

  // Try database settings (decrypted)
  try {
    const row = db.select({ value: schema.settings.value })
      .from(schema.settings)
      .where(eq(schema.settings.key, 'inat_username'))
      .get();
    const pwdRow = db.select({ value: schema.settings.value })
      .from(schema.settings)
      .where(eq(schema.settings.key, 'inat_password'))
      .get();

    if (row?.value && pwdRow?.value) {
      const username = isEncrypted(row.value) ? decrypt(row.value) : row.value;
      const password = isEncrypted(pwdRow.value) ? decrypt(pwdRow.value) : pwdRow.value;
      if (username && password) {
        console.log('[iNaturalist] Loaded credentials from database settings');
        return { username, password };
      }
    }
  } catch {
    // DB not available
  }

  return null;
}

async function refreshToken(): Promise<string | null> {
  const creds = await loadCredentials();
  if (!creds) {
    console.log('[iNaturalist] No credentials found for auto-refresh');
    return null;
  }

  const { username, password } = creds;

  try {
    // Step 1: GET CSRF token
    const csrfRes = await fetch('https://www.inaturalist.org/users/api_token', {
      headers: { 'User-Agent': 'BirdLog/1.0' },
    });
    if (!csrfRes.ok) throw new Error(`CSRF fetch failed: ${csrfRes.status}`);

    const csrfText = await csrfRes.text();
    const csrfMatch = csrfText.match(/name="authenticity_token" value="([^"]+)"/);
    if (!csrfMatch) throw new Error('CSRF token not found');
    const csrfToken = csrfMatch[1];

    // Step 2: POST login
    const loginRes = await fetch('https://www.inaturalist.org/session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'BirdLog/1.0',
      },
      body: new URLSearchParams({
        authenticity_token: csrfToken,
        'user[email]': username,
        'user[password]': password,
        utf8: '\u2713',
      }).toString(),
    });

    if (!loginRes.ok) throw new Error(`Login failed: ${loginRes.status}`);

    const loginText = await loginRes.text();

    // Step 3: Extract API token from response
    const tokenMatch = loginText.match(/"api_token"\s*:\s*"([A-Za-z0-9\-_\.]+)"/);
    if (!tokenMatch) {
      // Check if login actually succeeded
      if (!loginText.includes('api_token')) {
        throw new Error('API token not found in login response');
      }
    }
    const newToken = tokenMatch?.[1];
    if (!newToken) throw new Error('Failed to extract token');

    console.log('[iNaturalist] Successfully refreshed token');

    // Step 4: Optionally update the stored token in database
    try {
      const existing = db.select({ key: schema.settings.key })
        .from(schema.settings)
        .where(eq(schema.settings.key, 'inat_api_token'))
        .get();
      if (existing) {
        const toStore = isEncrypted(existing.key) ? encrypt(newToken) : newToken;
        db.update(schema.settings)
          .set({ value: toStore, updatedAt: new Date().toISOString() })
          .where(eq(schema.settings.key, 'inat_api_token'))
          .run();
        console.log('[iNaturalist] Updated stored token');
      }
    } catch {
      // DB not available or other error
    }

    return newToken;
  } catch (err) {
    console.error('[iNaturalist] Token refresh failed:', err);
    return null;
  }
}