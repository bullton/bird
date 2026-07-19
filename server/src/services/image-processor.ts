import sharp from 'sharp';
import exifr from 'exifr';
import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

export interface ExifInfo {
  takenAt?: string;
  lat?: number;
  lng?: number;
  altitudeM?: number;
  raw: Record<string, unknown>;
}

export interface ProcessedImage {
  hash: string;
  originalRel: string;
  mainRel: string;
  aiRel: string;
  thumbRel: string;
  originalSize: number;
  width: number;
  height: number;
  exif: ExifInfo;
}

const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg']);
const ALLOWED_EXT = new Set(['.jpg', '.jpeg']);

export function isAllowedImage(filename: string, mime: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return ALLOWED_MIME.has(mime) || ALLOWED_EXT.has(ext);
}

function ensureDir(p: string) {
  return mkdir(p, { recursive: true });
}

function parseExif(raw: any): ExifInfo {
  const takenAt = raw?.DateTimeOriginal ?? raw?.CreateDate ?? raw?.ModifyDate;
  let takenAtStr: string | undefined;
  if (takenAt instanceof Date) takenAtStr = takenAt.toISOString();
  else if (typeof takenAt === 'string') takenAtStr = takenAt;
  return {
    takenAt: takenAtStr,
    lat: typeof raw?.latitude === 'number' ? raw.latitude : undefined,
    lng: typeof raw?.longitude === 'number' ? raw.longitude : undefined,
    altitudeM: typeof raw?.altitude === 'number' ? raw.altitude : undefined,
    raw: raw ?? {},
  };
}

export async function processUpload(buffer: Buffer, originalName: string): Promise<ProcessedImage> {
  if (!isAllowedImage(originalName, 'image/jpeg')) {
    throw new Error('UNSUPPORTED_FORMAT');
  }
  const hash = createHash('sha256').update(buffer).digest('hex');
  const photosRoot = path.resolve(config.photosDir);
  // originals 目录仍保留（兼容旧数据清理脚本需要），但新上传不再写入
  await ensureDir(path.join(photosRoot, 'originals'));
  await ensureDir(path.join(photosRoot, 'main'));
  await ensureDir(path.join(photosRoot, 'ai'));
  await ensureDir(path.join(photosRoot, 'thumbs'));

  let exifRaw: any = {};
  try {
    exifRaw = await exifr.parse(buffer, {
      tiff: true,
      ifd0: true,
      exif: true,
      gps: true,
      pick: [
        'DateTimeOriginal', 'CreateDate', 'ModifyDate',
        'latitude', 'longitude', 'altitude',
        'Make', 'Model', 'LensModel',
        'FNumber', 'ExposureTime', 'ISO', 'FocalLength',
      ],
    }) ?? {};
  } catch {
    exifRaw = {};
  }
  const exif = parseExif(exifRaw);

  const ext = path.extname(originalName).toLowerCase() || '.jpg';
  // 不再保存原图：EXIF 已提取到 exifJson，节省 95% 磁盘
  const origRel = '';

  const mainBuf = await sharp(buffer, { failOn: 'none' })
    .rotate()
    .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true })
    .withMetadata({})
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
  const mainRel = path.join('main', `${hash}.jpg`);
  await writeFile(path.join(photosRoot, mainRel), mainBuf);

  // 1024px AI 版：不带 EXIF，quality 85，省 token、提速
  const aiBuf = await sharp(buffer, { failOn: 'none' })
    .rotate()
    .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
  const aiRel = path.join('ai', `${hash}.jpg`);
  await writeFile(path.join(photosRoot, aiRel), aiBuf);

  const thumbBuf = await sharp(buffer, { failOn: 'none' })
    .rotate()
    .resize({ width: 400, height: 400, fit: 'inside' })
    .jpeg({ quality: 85 })
    .toBuffer();
  const thumbRel = path.join('thumbs', `${hash}.jpg`);
  await writeFile(path.join(photosRoot, thumbRel), thumbBuf);

  const meta = await sharp(buffer).metadata();

  return {
    hash,
    originalRel: origRel,
    mainRel: mainRel,
    aiRel: aiRel,
    thumbRel: thumbRel,
    originalSize: buffer.length,
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    exif,
  };
}

export async function removeFiles(relPaths: string[]) {
  const root = path.resolve(config.photosDir);
  for (const rel of relPaths) {
    if (!rel) continue;
    try {
      await unlink(path.join(root, rel));
    } catch {
      // ignore
    }
  }
}

export function fileUrl(relPath: string): string {
  return '/photos/' + relPath.replace(/\\/g, '/');
}