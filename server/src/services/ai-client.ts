import { db, schema } from '../db/client.js';
import { eq } from 'drizzle-orm';
import { decrypt, isEncrypted } from '../utils/crypto.js';

const ENDPOINT = '/anthropic/v1/messages';

export interface Candidate {
  scientific_name: string;
  chinese_name?: string;
  english_name?: string;
  order_name?: string;
  family_name?: string;
  genus?: string;
  conservation?: string;
  body_length_cm?: number;
  confidence: number;
}

export interface IdentifyResult {
  candidates: Candidate[];
  model: string;
  requestId: string;
}

export interface SpeciesDescription {
  chinese_name?: string;
  english_name: string;
  order_name: string;
  family_name: string;
  genus: string;
  conservation: string;
  body_length_cm: number;
  description: string;
  habitat?: string;
  diet?: string;
  distribution?: string;
}

interface AIConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  temperature: number;
}

function loadConfig(): AIConfig {
  const get = (key: string, fallback = '') => {
    const row = db.select({ value: schema.settings.value }).from(schema.settings).where(eq(schema.settings.key, key)).get();
    return row?.value ?? fallback;
  };
  const apiKeyRaw = get('ai_api_key');
  const apiKey = apiKeyRaw && isEncrypted(apiKeyRaw) ? decrypt(apiKeyRaw) : apiKeyRaw;
  return {
    apiKey,
    baseUrl: get('ai_base_url', 'https://api.minimaxi.com'),
    model: get('ai_model', 'MiniMax-M3'),
    timeoutMs: parseInt(get('ai_timeout_ms', '30000'), 10),
    temperature: parseFloat(get('ai_temperature', '0.2')),
  };
}

async function callMessages(systemPrompt: string, messages: any[], cfg: AIConfig): Promise<string> {
  const url = `${cfg.baseUrl.replace(/\/$/, '')}${ENDPOINT}`;
  const body = {
    model: cfg.model,
    max_tokens: 2000,
    temperature: cfg.temperature,
    system: systemPrompt,
    messages,
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`AI API ${res.status}: ${text.slice(0, 200)}`);
    }
    const data: any = await res.json();
    const text = (data.content ?? [])
      .map((b: any) => b?.text ?? '')
      .filter(Boolean)
      .join('\n');
    if (!text) throw new Error('AI response has no text content');
    return text;
  } finally {
    clearTimeout(timer);
  }
}

function extractJson<T>(text: string): T {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('AI response has no JSON block');
  return JSON.parse(m[0]) as T;
}

export async function callIdentify(imageBuffer: Buffer, hint?: { takenAt?: string; locationName?: string }): Promise<IdentifyResult> {
  const cfg = loadConfig();
  if (!cfg.apiKey) throw new Error('AI API Key 未配置，请到系统设置填写');

  const system = `你是鸟类学家。根据用户提供的鸟类照片，识别物种并按 JSON 格式返回 Top-5 候选。
要求：
- 仔细观察羽色、体型、喙形、栖息环境等关键特征
- 给出科学、准确的判断
- 若不确定，给出多个候选并按置信度排序
- 只输出 JSON，不要任何解释文字`;

  const ctxParts: string[] = [];
  if (hint?.takenAt) ctxParts.push(`拍摄时间:${hint.takenAt}`);
  if (hint?.locationName) ctxParts.push(`地点:${hint.locationName}`);
  const ctx = ctxParts.length > 0 ? `\n[上下文] ${ctxParts.join(' ')}` : '';

  const userText = `识别图中鸟类${ctx}。严格输出 JSON：
{
  "candidates": [
    {
      "scientific_name": "拉丁学名",
      "chinese_name": "中文名",
      "english_name": "英文名",
      "order_name": "目",
      "family_name": "科",
      "genus": "属",
      "conservation": "IUCN 等级 (LC/NT/VU/EN/CR)",
      "body_length_cm": 数字或 null,
      "confidence": 0~1
    }
  ]
}`;

  const b64 = imageBuffer.toString('base64');
  const userMsg = {
    role: 'user',
    content: [
      { type: 'text', text: userText },
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
    ],
  };

  const text = await callMessages(system, [userMsg], cfg);
  const json = extractJson<{ candidates?: Candidate[] }>(text);

  return {
    candidates: Array.isArray(json.candidates) ? json.candidates : [],
    model: cfg.model,
    requestId: `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
  };
}

export async function callGenerateDescription(scientificName: string, chineseName: string): Promise<SpeciesDescription> {
  const cfg = loadConfig();
  if (!cfg.apiKey) throw new Error('AI API Key 未配置，请到系统设置填写');

  const system = `你是鸟类学研究者。你需要根据提供的中文名或学名，查明该鸟类的完整分类学信息并撰写学术简介。所有字段（english_name、order_name、family_name、genus、conservation、body_length_cm、description、habitat、diet、distribution）都必须填写，不得返回空值或 null。如果不确定某字段，应根据该物种的公开学术资料给出合理值。`;

  const userText = `查找以下鸟类的完整分类信息：
中文名：${chineseName || scientificName}
学名（已知时）：${scientificName}

请通过你的知识库查找该鸟类的：
1. 英文名（english_name）
2. 目（order_name），如鸡形目、雀形目等
3. 科（family_name），如雉科、鸦科等
4. 属（genus）
5. IUCN保护等级（conservation）：LC/NT/VU/EN/CR
6. 成年体长（body_length_cm）：数字，单位厘米
7. description（150~250字）：形态特征、生态习性
8. habitat（80~150字）：典型栖息环境
9. diet（80~150字）：主要食物与觅食行为
10. distribution（80~150字）：地理分布

严格输出完整 JSON，所有字段都必须有值：
{
  "chinese_name": "该鸟的中文名",
  "english_name": "英文俗名",
  "order_name": "目名",
  "family_name": "科名",
  "genus": "属名",
  "conservation": "LC",
  "body_length_cm": 25,
  "description": "...",
  "habitat": "...",
  "diet": "...",
  "distribution": "..."
}`;

  const text = await callMessages(system, [{ role: 'user', content: userText }], cfg);
  return extractJson<SpeciesDescription>(text);
}