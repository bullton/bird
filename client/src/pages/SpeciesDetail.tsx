import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, Descriptions, Typography, Skeleton, Empty, Tag, Space, Button, Input, App, Divider } from 'antd';
import { speciesApi, sightingsApi } from '../api';
import { useAuth } from '../stores/auth';
import { Edit3, Save, X } from 'lucide-react';
import dayjs from 'dayjs';

export function SpeciesDetail() {
  const { id } = useParams();
  const speciesId = parseInt(id || '0', 10);
  const { user } = useAuth();
  const navigate = useNavigate();
  const { message } = App.useApp();

  const { data: sp, isLoading } = useQuery({
    queryKey: ['species', speciesId],
    queryFn: () => speciesApi.get(speciesId),
    enabled: speciesId > 0,
  });

  const { data: photos } = useQuery({
    queryKey: ['sightings', { speciesId }],
    queryFn: () => sightingsApi.list({ speciesId, page: 1 }),
    enabled: speciesId > 0,
  });

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});

  function startEdit() {
    if (!sp) return;
    setForm({
      chineseName: sp.chineseName || '',
      englishName: sp.englishName || '',
      orderName: sp.orderName || '',
      familyName: sp.familyName || '',
      genus: sp.genus || '',
      conservation: sp.conservation || '',
      bodyLengthCm: sp.bodyLengthCm ?? '',
      description: sp.description || '',
      habitat: sp.habitat || '',
      diet: sp.diet || '',
      distribution: sp.distribution || '',
    });
    setEditing(true);
  }

  async function save() {
    try {
      await speciesApi.update(speciesId, {
        ...form,
        bodyLengthCm: form.bodyLengthCm === '' ? undefined : Number(form.bodyLengthCm),
      });
      message.success('已保存');
      setEditing(false);
    } catch (e: any) {
      message.error(e.message || '保存失败');
    }
  }

  if (isLoading) return <div className="page-container"><Skeleton active /></div>;
  if (!sp) return <div className="page-container"><Empty /></div>;

  const items = photos?.items ?? [];

  return (
    <div className="page-container">
      <Button type="link" onClick={() => navigate(-1)} style={{ paddingLeft: 0 }}>← 返回</Button>
      <Typography.Title level={3} className="page-title" style={{ marginTop: 8 }}>
        {sp.chineseName || sp.scientificName}
        {sp.createdVia === 'ai' && <Tag color="blue" style={{ marginLeft: 8 }}>AI 收录</Tag>}
        {sp.createdVia === 'manual' && <Tag color="default" style={{ marginLeft: 8 }}>手动</Tag>}
      </Typography.Title>

      {editing ? (
        <Card>
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Input addonBefore="中文名" value={form.chineseName} onChange={(e) => setForm({ ...form, chineseName: e.target.value })} />
            <Input addonBefore="英文名" value={form.englishName} onChange={(e) => setForm({ ...form, englishName: e.target.value })} />
            <Space>
              <Input addonBefore="目" value={form.orderName} onChange={(e) => setForm({ ...form, orderName: e.target.value })} />
              <Input addonBefore="科" value={form.familyName} onChange={(e) => setForm({ ...form, familyName: e.target.value })} />
              <Input addonBefore="属" value={form.genus} onChange={(e) => setForm({ ...form, genus: e.target.value })} />
            </Space>
            <Space>
              <Input addonBefore="保护级别" value={form.conservation} onChange={(e) => setForm({ ...form, conservation: e.target.value })} style={{ width: 200 }} />
              <Input addonBefore="体长(cm)" type="number" value={form.bodyLengthCm} onChange={(e) => setForm({ ...form, bodyLengthCm: e.target.value })} style={{ width: 200 }} />
            </Space>
            <Input.TextArea rows={4} placeholder="形态与习性描述" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <Input.TextArea rows={2} placeholder="栖息地" value={form.habitat} onChange={(e) => setForm({ ...form, habitat: e.target.value })} />
            <Input.TextArea rows={2} placeholder="食性" value={form.diet} onChange={(e) => setForm({ ...form, diet: e.target.value })} />
            <Input.TextArea rows={2} placeholder="分布" value={form.distribution} onChange={(e) => setForm({ ...form, distribution: e.target.value })} />
            <Space>
              <Button type="primary" icon={<Save size={14} />} onClick={save}>保存</Button>
              <Button icon={<X size={14} />} onClick={() => setEditing(false)}>取消</Button>
            </Space>
          </Space>
        </Card>
      ) : (
        <Card extra={user && <Button icon={<Edit3 size={14} />} onClick={startEdit}>编辑</Button>}>
          <Descriptions column={2} size="small" bordered>
            <Descriptions.Item label="学名"><i>{sp.scientificName}</i></Descriptions.Item>
            <Descriptions.Item label="英文名">{sp.englishName || '-'}</Descriptions.Item>
            <Descriptions.Item label="目">{sp.orderName || '-'}</Descriptions.Item>
            <Descriptions.Item label="科">{sp.familyName || '-'}</Descriptions.Item>
            <Descriptions.Item label="属">{sp.genus || '-'}</Descriptions.Item>
            <Descriptions.Item label="保护级别">{sp.conservation || '-'}</Descriptions.Item>
            <Descriptions.Item label="体长">{sp.bodyLengthCm ? `${sp.bodyLengthCm} cm` : '-'}</Descriptions.Item>
            <Descriptions.Item label="我的拍摄">
              {sp.stats?.total ?? 0} 张
            </Descriptions.Item>
          </Descriptions>

          <Divider />

          {sp.description ? (
            <>
              <Typography.Title level={5}>简介</Typography.Title>
              <Typography.Paragraph>{sp.description}</Typography.Paragraph>
            </>
          ) : (
            <Typography.Paragraph type="secondary">暂无简介，AI 识别后会自动生成</Typography.Paragraph>
          )}
          {sp.habitat && (
            <>
              <Typography.Title level={5}>栖息地</Typography.Title>
              <Typography.Paragraph>{sp.habitat}</Typography.Paragraph>
            </>
          )}
          {sp.diet && (
            <>
              <Typography.Title level={5}>食性</Typography.Title>
              <Typography.Paragraph>{sp.diet}</Typography.Paragraph>
            </>
          )}
          {sp.distribution && (
            <>
              <Typography.Title level={5}>分布</Typography.Title>
              <Typography.Paragraph>{sp.distribution}</Typography.Paragraph>
            </>
          )}
        </Card>
      )}

      <Typography.Title level={4} style={{ marginTop: 24 }}>我的拍摄 ({items.length})</Typography.Title>
      {items.length === 0 ? (
        <Empty />
      ) : (
        <div className="thumb-grid">
          {items.map((s) => (
            <div key={s.id} className="thumb-card">
              <img src={s.thumbUrl} alt="" loading="lazy" />
              <div className="thumb-meta">
                <div className="date">{s.takenAt ? dayjs(s.takenAt).format('YYYY-MM-DD') : dayjs(s.uploadedAt).format('YYYY-MM-DD')}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}