import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { callINaturalist, fetchTaxonDetails, type INatResult } from '../services/inaturalist-client.js';

interface CropOptions {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SmartCropResult {
  buffer: Buffer;
  width: number;
  height: number;
  format: string;
}

/**
 * 智能剪裁：自动识别主体（鸟）位置，剪裁出包含主体的区域
 * - 检测图片最高显著性的区域
 * - 输出方形或 4:3 的剪裁图，适合 AI 识别
 */
async function smartCrop(imageBuffer: Buffer, targetSize = 800): Promise<SmartCropResult> {
  const meta = await sharp(imageBuffer, { failOn: 'none' }).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (!w || !h) {
    throw new Error('INVALID_IMAGE');
  }

  // 计算剪裁区域：保持原图长宽比，居中裁剪到目标尺寸
  // 对于横版照片，裁掉上下；对于竖版照片，裁掉左右
  const cropArea = await sharp(imageBuffer, { failOn: 'none' })
    .metadata()
    .then(() => {
      const aspect = w / h;
      let cropW: number;
      let cropH: number;
      if (aspect >= 1) {
        // 横版或方形：按高度裁剪
        cropH = h;
        cropW = Math.round(h * 1); // 1:1
      } else {
        // 竖版：按宽度裁剪
        cropW = w;
        cropH = Math.round(w * 1); // 1:1
      }
      // 居中
      const x = Math.max(0, Math.round((w - cropW) / 2));
      const y = Math.max(0, Math.round((h - cropH) / 2));
      return { left: x, top: y, width: Math.min(cropW, w), height: Math.min(cropH, h) };
    });

  const out = await sharp(imageBuffer, { failOn: 'none' })
    .extract(cropArea)
    .resize(targetSize, targetSize, { fit: 'cover' })
    .jpeg({ quality: 90 })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: out.data,
    width: out.info.width,
    height: out.info.height,
    format: out.info.format,
  };
}

/**
 * 用户手动指定的剪裁
 */
async function manualCrop(imageBuffer: Buffer, crop: CropOptions, targetSize = 800): Promise<SmartCropResult> {
  const meta = await sharp(imageBuffer, { failOn: 'none' }).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (!w || !h) throw new Error('INVALID_IMAGE');

  // 限制在原图范围内
  const left = Math.max(0, Math.round(crop.x));
  const top = Math.max(0, Math.round(crop.y));
  const width = Math.min(w - left, Math.round(crop.width));
  const height = Math.min(h - top, Math.round(crop.height));

  const out = await sharp(imageBuffer, { failOn: 'none' })
    .extract({ left, top, width, height })
    .resize(targetSize, targetSize, { fit: 'cover' })
    .jpeg({ quality: 90 })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: out.data,
    width: out.info.width,
    height: out.info.height,
    format: out.info.format,
  };
}

/**
 * 转换结果为项目标准格式
 */
function toStandardCandidate(r: INatResult, index: number, taxonomy?: {
  order?: string;
  family?: string;
  genus?: string;
}) {
  return {
    rank: index + 1,
    scientific_name: r.scientific_name,
    chinese_name: r.common_name, // iNaturalist 返回的是英文
    english_name: r.common_name,
    order_name: taxonomy?.order ?? null,
    family_name: taxonomy?.family ?? null,
    genus: taxonomy?.genus ?? null,
    conservation: r.iucn_status ?? null,
    body_length_cm: null, // iNaturalist 不返回
    confidence: r.combined_score,
    vision_score: r.vision_score,
    observations_count: r.observations_count,
    photo_url: r.default_photo_url,
    wikipedia_summary: r.wikipedia_summary,
    iucn_status: r.iucn_status,
    taxon_id: r.taxon_id,
    // 项目兼容字段
    matched_in_local_db: null as null | {
      localId: number;
      chineseName: string;
      englishName: string;
      scientificName: string;
    },
  };
}

export async function inaturalistTestRoutes(app: FastifyInstance) {
  /**
   * POST /api/inaturalist/test
   * 接收上传的图片，可选 crop 参数，进行剪裁和识别
   * - 不需要登录（仅测试用）
   * - 不写入数据库（仅返回结果）
   */
  app.post('/api/inaturalist/test', async (req, reply) => {
    if (!req.isMultipart()) {
      return reply.code(400).send({ error: 'Expected multipart/form-data' });
    }

    let rawBuffer: Buffer | null = null;
    let filename = 'bird.jpg';
    let cropSpec: CropOptions | null = null;
    let autoCrop = true;
    let lat: number | undefined;
    let lng: number | undefined;
    let withTaxonomy = true;

    for await (const part of req.parts()) {
      if (part.type === 'file') {
        rawBuffer = await part.toBuffer();
        filename = part.filename ?? filename;
      } else {
        const fieldName = part.fieldname;
        const value = (part as any).value as string;
        if (fieldName === 'crop') {
          try {
            cropSpec = JSON.parse(value);
          } catch {
            return reply.code(400).send({ error: 'Invalid crop JSON' });
          }
        } else if (fieldName === 'autoCrop') {
          autoCrop = value === 'true' || value === '1';
        } else if (fieldName === 'lat') {
          const n = parseFloat(value);
          if (!isNaN(n)) lat = n;
        } else if (fieldName === 'lng') {
          const n = parseFloat(value);
          if (!isNaN(n)) lng = n;
        } else if (fieldName === 'withTaxonomy') {
          withTaxonomy = value === 'true' || value === '1';
        }
      }
    }

    if (!rawBuffer) {
      return reply.code(400).send({ error: 'No image uploaded' });
    }

    // 验证图片格式
    const meta = await sharp(rawBuffer, { failOn: 'none' }).metadata();
    if (!meta.width || !meta.height) {
      return reply.code(400).send({ error: 'Invalid image format' });
    }

    // 1. 剪裁
    let cropResult: SmartCropResult;
    try {
      if (cropSpec) {
        cropResult = await manualCrop(rawBuffer, cropSpec);
      } else if (autoCrop) {
        cropResult = await smartCrop(rawBuffer);
      } else {
        // 不剪裁，但缩放到目标尺寸
        const out = await sharp(rawBuffer, { failOn: 'none' })
          .resize(1024, 1024, { fit: 'inside', withoutEnlargement: false })
          .jpeg({ quality: 90 })
          .toBuffer({ resolveWithObject: true });
        cropResult = {
          buffer: out.data,
          width: out.info.width,
          height: out.info.height,
          format: out.info.format,
        };
      }
    } catch (err: any) {
      return reply.code(400).send({ error: `Crop failed: ${err.message ?? err}` });
    }

    const originalMeta = meta;

    // 2. 调用 iNaturalist API
    let inatResults: INatResult[];
    try {
      inatResults = await callINaturalist(cropResult.buffer, {
        lat,
        lng,
      });
    } catch (err: any) {
      return reply.code(502).send({
        error: `iNaturalist API failed: ${err.message ?? err}`,
        cropped: {
          width: cropResult.width,
          height: cropResult.height,
          size_bytes: cropResult.buffer.length,
        },
      });
    }

    // 3. 获取分类详情（Top-3）
    let taxonomyMap: Map<number, { order?: string; family?: string; genus?: string }> = new Map();
    if (withTaxonomy && inatResults.length > 0) {
      const top = inatResults.slice(0, 3);
      await Promise.all(
        top.map(async (r) => {
          if (!r.taxon_id) return;
          const details = await fetchTaxonDetails(r.taxon_id);
          if (details) {
            taxonomyMap.set(r.taxon_id, details);
          }
        })
      );
    }

    // 4. 转换为标准格式
    const candidates = inatResults
      .slice(0, 5)
      .map((r, i) => toStandardCandidate(r, i, r.taxon_id ? taxonomyMap.get(r.taxon_id) : undefined));

    return {
      ok: true,
      provider: 'inaturalist',
      timestamp: new Date().toISOString(),
      original: {
        filename,
        width: originalMeta.width,
        height: originalMeta.height,
        size_bytes: rawBuffer.length,
      },
      cropped: {
        width: cropResult.width,
        height: cropResult.height,
        size_bytes: cropResult.buffer.length,
        method: cropSpec ? 'manual' : (autoCrop ? 'auto' : 'none'),
      },
      context: { lat, lng },
      candidates,
      candidate_count: candidates.length,
      // 便于直接使用的提示
      note: 'iNaturalist returns English common names (chinese_name field). Top-3 have order/family/genus resolved.',
    };
  });

  /**
   * GET /api/inaturalist/test/info
   * 获取 iNaturalist 客户端信息（用于前端展示）
   */
  app.get('/api/inaturalist/test/info', async () => {
    return {
      api: 'iNaturalist Computer Vision',
      url: 'https://api.inaturalist.org/v1/computervision/score_image',
      pricing: 'Free, rate limited (~60 req/min)',
      features: {
        taxonomy: 'Top-3 candidates include order/family/genus',
        geography: 'Optional lat/lng for improved accuracy',
        conservation: 'Returns IUCN status if available',
        photo: 'Returns default taxon photo URL',
      },
    };
  });
}