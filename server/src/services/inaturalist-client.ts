// iNaturalist Computer Vision API client
// 文档：https://www.inaturalist.org/pages/api+docs
// 端点：https://api.inaturalist.org/v1/computervision/score_image

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
 * 调用 iNaturalist Computer Vision API
 */
export async function callINaturalist(
  imageBuffer: Buffer,
  options: CallOptions = {}
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

  // JWT token 必须（iNaturalist vision API 需要认证）
  const apiToken = options.apiToken;
  if (!apiToken) {
    throw new Error('iNaturalist API token 未配置。请在系统设置中填写 (ai_api_token) 或环境变量 INAT_API_TOKEN');
  }

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