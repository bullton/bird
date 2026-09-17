import { useRef, useState } from 'react';
import {
  Card,
  Typography,
  Button,
  Space,
  Upload,
  Tag,
  Slider,
  Switch,
  message as antMessage,
  Alert,
  Empty,
  Spin,
  Row,
  Col,
  Descriptions,
  Tooltip,
} from 'antd';
import { UploadOutlined, CameraOutlined, ScissorOutlined, ReloadOutlined } from '@ant-design/icons';
import { Bird, MapPin, AlertCircle } from 'lucide-react';

interface Candidate {
  rank: number;
  scientific_name: string;
  chinese_name: string;
  english_name: string;
  order_name: string | null;
  family_name: string | null;
  genus: string | null;
  conservation: string | null;
  body_length_cm: number | null;
  confidence: number;
  vision_score: number;
  observations_count?: number;
  photo_url?: string;
  wikipedia_summary?: string;
  iucn_status?: string;
  taxon_id?: number;
  matched_in_local_db: null | {
    localId: number;
    chineseName: string;
    englishName: string;
    scientificName: string;
  };
}

interface TestResult {
  ok: boolean;
  provider: string;
  timestamp: string;
  original: {
    filename: string;
    width: number;
    height: number;
    size_bytes: number;
  };
  cropped: {
    width: number;
    height: number;
    size_bytes: number;
    method: string;
  };
  context: { lat?: number; lng?: number };
  candidates: Candidate[];
  candidate_count: number;
  note: string;
}

export function INaturalistTest() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [autoCrop, setAutoCrop] = useState(true);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [useGeo, setUseGeo] = useState(false);
  const [withTaxonomy, setWithTaxonomy] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = (file: File | null) => {
    setError(null);
    setResult(null);
    if (!file) {
      setFile(null);
      setPreviewUrl(null);
      return;
    }

    if (!file.type.startsWith('image/')) {
      antMessage.error('请选择图片文件');
      return;
    }

    setFile(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
  };

  const getGeo = () => {
    if (!navigator.geolocation) {
      antMessage.warning('浏览器不支持地理定位');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(parseFloat(pos.coords.latitude.toFixed(4)));
        setLng(parseFloat(pos.coords.longitude.toFixed(4)));
        setUseGeo(true);
        antMessage.success('已获取位置');
      },
      (err) => {
        antMessage.error('获取位置失败：' + err.message);
      }
    );
  };

  const runTest = async () => {
    if (!file) {
      antMessage.warning('请先选择图片');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    const fd = new FormData();
    fd.append('image', file);
    fd.append('autoCrop', String(autoCrop));
    fd.append('withTaxonomy', String(withTaxonomy));
    if (useGeo && lat !== null && lng !== null) {
      fd.append('lat', String(lat));
      fd.append('lng', String(lng));
    }

    try {
      const res = await fetch('/api/inaturalist/test', {
        method: 'POST',
        body: fd,
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
      } else {
        setResult(data);
      }
    } catch (err: any) {
      setError(err?.message ?? '请求失败');
    } finally {
      setLoading(false);
    }
  };

  const confidenceColor = (c: number) => {
    if (c >= 0.8) return 'green';
    if (c >= 0.6) return 'lime';
    if (c >= 0.4) return 'gold';
    if (c >= 0.2) return 'orange';
    return 'red';
  };

  return (
    <div className="page-container">
      <Typography.Title level={3} className="page-title">
        <Bird size={20} style={{ marginRight: 8, verticalAlign: '-3px' }} />
        iNaturalist 测试
      </Typography.Title>

      <Alert
        message="测试页面"
        description="仅供调试用：上传图片 → 自动剪裁 → 调用 iNaturalist Computer Vision API → 输出项目兼容格式。不写入数据库，不影响现有功能。"
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Card title="1. 上传图片" size="small">
            <Space direction="vertical" style={{ width: '100%' }}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  handleFileSelect(f);
                  e.target.value = '';
                }}
              />
              <Space wrap>
                <Button
                  type="primary"
                  icon={<UploadOutlined />}
                  onClick={() => fileInputRef.current?.click()}
                >
                  选择文件
                </Button>
                {file && (
                  <Button onClick={() => handleFileSelect(null)} danger>
                    清除
                  </Button>
                )}
              </Space>

              {previewUrl && (
                <div style={{ marginTop: 8, border: '1px solid #d9d9d9', borderRadius: 6, overflow: 'hidden' }}>
                  <img
                    src={previewUrl}
                    alt="preview"
                    style={{ display: 'block', width: '100%', maxHeight: 400, objectFit: 'contain' }}
                  />
                </div>
              )}

              {file && (
                <Typography.Text type="secondary">
                  {file.name} ({(file.size / 1024).toFixed(1)} KB)
                </Typography.Text>
              )}
            </Space>
          </Card>

          <Card title="2. 配置" size="small" style={{ marginTop: 16 }}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>自动剪裁（方形，居中）</span>
                <Switch checked={autoCrop} onChange={setAutoCrop} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>获取分类（目/科/属，需额外请求）</span>
                <Switch checked={withTaxonomy} onChange={setWithTaxonomy} />
              </div>

              <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span>
                    <MapPin size={14} style={{ marginRight: 4, verticalAlign: '-2px' }} />
                    地理位置（可选，提高准确率）
                  </span>
                  <Space>
                    <Switch
                      checked={useGeo}
                      onChange={(v) => {
                        setUseGeo(v);
                        if (v) getGeo();
                      }}
                    />
                    <Button size="small" onClick={getGeo}>
                      获取
                    </Button>
                  </Space>
                </div>
                {useGeo && (
                  <Space>
                    <span>lat:</span>
                    <Slider
                      min={-90}
                      max={90}
                      step={0.01}
                      value={lat ?? 0}
                      onChange={(v) => setLat(v)}
                      style={{ width: 120 }}
                    />
                    <span style={{ minWidth: 60 }}>{lat?.toFixed(2) ?? '-'}</span>
                    <span>lng:</span>
                    <Slider
                      min={-180}
                      max={180}
                      step={0.01}
                      value={lng ?? 0}
                      onChange={(v) => setLng(v)}
                      style={{ width: 120 }}
                    />
                    <span style={{ minWidth: 60 }}>{lng?.toFixed(2) ?? '-'}</span>
                  </Space>
                )}
              </div>
            </Space>
          </Card>

          <Card
            title="3. 识别"
            size="small"
            style={{ marginTop: 16 }}
            extra={
              <Button
                type="primary"
                icon={<ReloadOutlined spin={loading} />}
                onClick={runTest}
                disabled={!file || loading}
                loading={loading}
              >
                开始识别
              </Button>
            }
          >
            {loading && (
              <div style={{ textAlign: 'center', padding: 24 }}>
                <Spin tip="调用 iNaturalist API..." />
              </div>
            )}
            {error && (
              <Alert type="error" message={error} showIcon style={{ marginTop: 8 }} />
            )}
            {!loading && !error && !result && (
              <Empty description="等待识别结果" />
            )}
          </Card>
        </Col>

        <Col xs={24} md={12}>
          <Card title="识别结果" size="small">
            {result && (
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                <Descriptions size="small" column={1} bordered>
                  <Descriptions.Item label="Provider">{result.provider}</Descriptions.Item>
                  <Descriptions.Item label="原始">
                    {result.original.width}×{result.original.height} ({(result.original.size_bytes / 1024).toFixed(1)} KB)
                  </Descriptions.Item>
                  <Descriptions.Item label="剪裁">
                    {result.cropped.method} → {result.cropped.width}×{result.cropped.height} ({(result.cropped.size_bytes / 1024).toFixed(1)} KB)
                  </Descriptions.Item>
                  {result.context.lat !== undefined && (
                    <Descriptions.Item label="位置">
                      {result.context.lat.toFixed(2)}, {result.context.lng?.toFixed(2)}
                    </Descriptions.Item>
                  )}
                  <Descriptions.Item label="候选数">{result.candidate_count}</Descriptions.Item>
                </Descriptions>

                {result.candidates.length === 0 ? (
                  <Alert type="warning" message="未识别出结果（可能不是鸟，或置信度过低）" />
                ) : (
                  result.candidates.map((c) => (
                    <Card
                      key={c.taxon_id ?? c.scientific_name}
                      size="small"
                      title={
                        <Space>
                          <Tag color="blue">#{c.rank}</Tag>
                          <span style={{ fontWeight: 'bold' }}>{c.common_name || c.scientific_name}</span>
                          <Tag color={confidenceColor(c.confidence)}>
                            {(c.confidence * 100).toFixed(1)}%
                          </Tag>
                          <Tooltip title={`vision_score: ${(c.vision_score * 100).toFixed(1)}%`}>
                            <Tag>v: {(c.vision_score * 100).toFixed(0)}</Tag>
                          </Tooltip>
                        </Space>
                      }
                      extra={c.photo_url ? <img src={c.photo_url} alt="" style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 4 }} /> : null}
                    >
                      <Descriptions size="small" column={2} colon={false}>
                        <Descriptions.Item label={<b>学名</b>} span={2}>
                          <i>{c.scientific_name}</i>
                        </Descriptions.Item>
                        <Descriptions.Item label={<b>目</b>}>{c.order_name ?? '-'}</Descriptions.Item>
                        <Descriptions.Item label={<b>科</b>}>{c.family_name ?? '-'}</Descriptions.Item>
                        <Descriptions.Item label={<b>属</b>} span={2}>{c.genus ?? '-'}</Descriptions.Item>
                        <Descriptions.Item label={<b>IUCN</b>}>{c.iucn_status ?? '-'}</Descriptions.Item>
                        <Descriptions.Item label={<b>观察数</b>}>{c.observations_count?.toLocaleString() ?? '-'}</Descriptions.Item>
                      </Descriptions>
                      {c.wikipedia_summary && (
                        <Typography.Paragraph
                          type="secondary"
                          style={{ marginTop: 8, marginBottom: 0, fontSize: 12 }}
                          ellipsis={{ rows: 3, expandable: true, symbol: '展开' }}
                        >
                          {c.wikipedia_summary.replace(/<[^>]+>/g, '').slice(0, 400)}
                        </Typography.Paragraph>
                      )}
                      <div style={{ marginTop: 8, fontSize: 11, color: '#999' }}>
                        ↳ 标准格式（项目兼容）：
                        <pre style={{ marginTop: 4, marginBottom: 0, background: '#f5f5f5', padding: 6, borderRadius: 4, overflow: 'auto', fontSize: 10 }}>
{JSON.stringify({
  scientific_name: c.scientific_name,
  chinese_name: c.chinese_name,
  english_name: c.english_name,
  order_name: c.order_name,
  family_name: c.family_name,
  genus: c.genus,
  conservation: c.conservation,
  body_length_cm: c.body_length_cm,
  confidence: c.confidence,
}, null, 2)}
                        </pre>
                      </div>
                    </Card>
                  ))
                )}

                <Alert
                  message="兼容性说明"
                  description="返回的 candidate 字段结构与现有 AI 识别兼容（scientific_name/chinese_name/english_name/order_name/family_name/genus/conservation/body_length_cm/confidence）。"
                  type="info"
                  showIcon
                />
              </Space>
            )}
            {!result && <Empty description="等待识别结果" />}
          </Card>
        </Col>
      </Row>
    </div>
  );
}