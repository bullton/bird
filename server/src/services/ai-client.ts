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
  chinese_name: string;
  english_name: string;
  scientific_name: string;
  class_name: string;
  order_name: string;
  family_name: string;
  genus: string;
  conservation: string;
  cites_appendix: string;
  body_length_cm: number;
  description: string;
  habitat: string;
  diet: string;
  distribution: string;
  fun_facts: string;
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

  const system = `你是一个严格的中文鸟类学数据库。只输出 JSON，禁止任何解释文字或 markdown 包裹。
规则（必须严格遵守，所有字段都必须有实际内容）：
1. scientific_name（拉丁学名）：必须是该物种的真实二名法拉丁学名（如 "Amazona albifrons"）。如果输入是中文名，你必须根据你的知识库推断出对应的标准拉丁学名——绝对不要直接用中文作为学名
2. 严格区分相似物种名：例如"斑皇鸠"（Ducula bracteata）和"点斑皇鸠"（Ducula goliath）是两个不同物种，绝不能混淆
3. class_name（纲）：一般是"鸟纲"
4. order_name（目）：中文，如"鸡形目"、"雀形目"、"鹦形目"
5. family_name（科）：中文，如"雉科"、"鸦科"、"金刚鹦鹉科"
6. genus（属）：中文（如"锦鸡属"、"亚马逊鹦鹉属"）。如果物种是 Amazona 属（亚马逊鹦鹉），必须写"亚马逊鹦鹉属"
7. conservation（保育状况，IUCN 等级）：格式"中文名（代码）"，如"无危（LC）"、"易危（VU）"、"濒危（EN）"、"极危（CR）"、"近危（NT）"
8. cites_appendix（CITES 附录）：如"附录 II"、"附录 I"、"未列入"
9. chinese_name：标准中文名
10. english_name：英文俗名
11. body_length_cm：数字（厘米），成年鸟体长
12. description（特征）：80~200字中文，形态特征（羽色、体型、雌雄差异）
13. habitat（生境）：80~150字中文，典型栖息环境
14. diet（食物）：80~150字中文，主要食物与觅食行为
15. distribution（分布）：80~150字中文，地理分布与季节性迁徙
16. fun_facts（有趣鸟类知识）：50~200字中文，关于该物种的有趣知识（寿命、习性、文化意义等）
17. 内容可以是中英文混合，专有名词可保留英文
18. 所有字段都必须有值`;

  const userText = `查找该鸟的完整分类学数据，只输出 JSON：

查询输入：
${scientificName === chineseName || !chineseName ? `物种名：${scientificName}` : `学名：${scientificName}\n中文名：${chineseName}`}

【关键】以下物种名高度相似，必须严格区分，绝对不能混淆：
- "斑皇鸠"（学名：Ducula bracteata）和"点斑皇鸠"（学名：Ducula goliath）是不同物种
- "白鹭"（学名：Egretta garzetta）和"大白鹭"（学名：Ardea alba）是不同物种
- "山雀"和"山雀属"下不同种不可混用
你必须根据上述学名和中文名，查找对应的准确信息，不要张冠李戴。

特别提醒：
- 如果输入是中文名，你必须根据鸟类学知识推断出对应的标准拉丁学名，绝对不能把中文名直接当作学名
- 属（genus）必须是该物种真实所属的属的中文名

JSON 格式（所有字段必填，不得为 null、空字符串或 undefined）：
{
  "chinese_name": "标准中文名",
  "english_name": "English Common Name",
  "scientific_name": "Genus species",
  "class_name": "鸟纲",
  "order_name": "目（中文）",
  "family_name": "科（中文）",
  "genus": "属（中文）",
  "conservation": "无危（LC）",
  "cites_appendix": "附录 II",
  "body_length_cm": 25,
  "description": "形态特征描述，80~200字",
  "habitat": "典型栖息环境，80~150字",
  "diet": "主要食物与觅食行为，80~150字",
  "distribution": "地理分布与季节性迁徙，80~150字",
  "fun_facts": "有趣的鸟类知识，50~200字"
}`;

  const text = await callMessages(system, [{ role: 'user', content: userText }], cfg);
  return extractJson<SpeciesDescription>(text);
}