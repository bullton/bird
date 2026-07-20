import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Descriptions, Typography, Skeleton, Empty, Tag, Space, Button, Input, App, Divider, Modal } from 'antd';
import { speciesApi, sightingsApi } from '../api';
import { useAuth } from '../stores/auth';
import { Edit3, Save, X, Image as ImageIcon } from 'lucide-react';
import dayjs from 'dayjs';

export function SpeciesDetail() {
  const { id } = useParams();
  const speciesId = parseInt(id || '0', 10);
  const { user } = useAuth();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const qc = useQueryClient();

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
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  function startEdit() {
    if (!sp) return;
    setForm({
      chineseName: sp.chineseName || '',
      englishName: sp.englishName || '',
      className: sp.className || '',
      orderName: sp.orderName || '',
      familyName: sp.familyName || '',
      genus: sp.genus || '',
      conservation: sp.conservation || '',
      citesAppendix: sp.citesAppendix || '',
      bodyLengthCm: sp.bodyLengthCm ?? '',
      description: sp.description || '',
      habitat: sp.habitat || '',
      diet: sp.diet || '',
      distribution: sp.distribution || '',
      funFacts: sp.funFacts || '',
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

  async function setCoverPhotoUrl(thumbUrl: string) {
    const pathThumb = thumbUrl.replace('/photos/', '');
    try {
      await speciesApi.update(speciesId, { coverPhotoPath: pathThumb });
      message.success('已设为封面');
      qc.invalidateQueries({ queryKey: ['species', speciesId] });
    } catch (e: any) {
      message.error(e.message || '设置失败');
    }
  }

  async function clearCoverPhoto() {
    try {
      await speciesApi.update(speciesId, { coverPhotoPath: null });
      message.success('已清除封面');
      qc.invalidateQueries({ queryKey: ['species', speciesId] });
    } catch (e: any) {
      message.error(e.message || '清除封面失败');
    }
  }

  async function regenerateDescription() {
    try {
      setRegenerating(true);
      await speciesApi.regenerate(speciesId);
      message.success('AI 介绍已生成');
      qc.invalidateQueries({ queryKey: ['species', speciesId] });
    } catch (e: any) {
      message.error(e.message || '生成失败');
    } finally {
      setRegenerating(false);
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
              <Input addonBefore="纲" value={form.className} onChange={(e) => setForm({ ...form, className: e.target.value })} style={{ width: 200 }} />
              <Input addonBefore="目" value={form.orderName} onChange={(e) => setForm({ ...form, orderName: e.target.value })} style={{ width: 200 }} />
            </Space>
            <Space>
              <Input addonBefore="科" value={form.familyName} onChange={(e) => setForm({ ...form, familyName: e.target.value })} />
              <Input addonBefore="属" value={form.genus} onChange={(e) => setForm({ ...form, genus: e.target.value })} />
            </Space>
            <Space>
              <Input addonBefore="保育状况" value={form.conservation} onChange={(e) => setForm({ ...form, conservation: e.target.value })} style={{ width: 200 }} />
              <Input addonBefore="CITES" value={form.citesAppendix} onChange={(e) => setForm({ ...form, citesAppendix: e.target.value })} style={{ width: 200 }} />
              <Input addonBefore="体长(cm)" type="number" value={form.bodyLengthCm} onChange={(e) => setForm({ ...form, bodyLengthCm: e.target.value })} style={{ width: 200 }} />
            </Space>
            <Input.TextArea rows={4} placeholder="形态与习性描述" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <Input.TextArea rows={2} placeholder="栖息地" value={form.habitat} onChange={(e) => setForm({ ...form, habitat: e.target.value })} />
            <Input.TextArea rows={2} placeholder="食性" value={form.diet} onChange={(e) => setForm({ ...form, diet: e.target.value })} />
            <Input.TextArea rows={2} placeholder="分布" value={form.distribution} onChange={(e) => setForm({ ...form, distribution: e.target.value })} />
            <Input.TextArea rows={3} placeholder="有趣鸟类知识" value={form.funFacts} onChange={(e) => setForm({ ...form, funFacts: e.target.value })} />
            <Space>
              <Button type="primary" icon={<Save size={14} />} onClick={save}>保存</Button>
              <Button icon={<X size={14} />} onClick={() => setEditing(false)}>取消</Button>
            </Space>
          </Space>
        </Card>
      ) : (
        <Card extra={user && (
          <Space>
            <Button icon={<Edit3 size={14} />} onClick={startEdit}>编辑</Button>
            <Button loading={regenerating} onClick={regenerateDescription}>AI 补全介绍</Button>
          </Space>
        )}>
          <Descriptions column={2} size="small" bordered>
            <Descriptions.Item label="学名"><i>{sp.scientificName}</i></Descriptions.Item>
            <Descriptions.Item label="英文名">{sp.englishName || '-'}</Descriptions.Item>
            <Descriptions.Item label="纲">{sp.className || '-'}</Descriptions.Item>
            <Descriptions.Item label="目">{sp.orderName || '-'}</Descriptions.Item>
            <Descriptions.Item label="科">{sp.familyName || '-'}</Descriptions.Item>
            <Descriptions.Item label="属">{sp.genus || '-'}</Descriptions.Item>
            <Descriptions.Item label="保育状况">{sp.conservation || '-'}</Descriptions.Item>
            <Descriptions.Item label="CITES">{sp.citesAppendix || '-'}</Descriptions.Item>
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
          {sp.funFacts && (
            <>
              <Typography.Title level={5}>有趣鸟类知识</Typography.Title>
              <Typography.Paragraph>{sp.funFacts}</Typography.Paragraph>
            </>
          )}
        </Card>
      )}

      <Typography.Title level={4} style={{ marginTop: 24 }}>
        我的拍摄 ({items.length})
        {sp.coverPhotoPath && (
          <Button type="link" size="small" onClick={clearCoverPhoto} style={{ marginLeft: 8 }}>清除封面</Button>
        )}
      </Typography.Title>
      {items.length === 0 ? (
        <Empty />
      ) : (
        <div className="thumb-grid">
          {items.map((s) => {
            const isCover = sp.coverPhotoPath !== null && sp.thumbUrl !== null && s.thumbUrl === sp.thumbUrl;
            return (
              <div
                key={s.id}
                className="thumb-card"
                style={{ cursor: 'pointer', position: 'relative' }}
              >
                <img
                  src={s.thumbUrl}
                  alt=""
                  loading="lazy"
                  onClick={() => setPreviewImage(s.mainUrl)}
                />
                <div
                  style={{
                    position: 'absolute',
                    top: 6,
                    right: 6,
                    background: 'rgba(0,0,0,0.6)',
                    color: '#fff',
                    borderRadius: 4,
                    padding: '2px 6px',
                    fontSize: 11,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                    opacity: isCover ? 1 : 0,
                    transition: 'opacity 0.2s',
                  }}
                  className="cover-overlay"
                >
                  {isCover ? (
                    <>
                      <ImageIcon size={10} /> 封面
                    </>
                  ) : (
                    <Button
                      type="text"
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCoverPhotoUrl(s.thumbUrl!);
                      }}
                      style={{ color: '#fff', padding: 0, height: 'auto' }}
                    >
                      设为封面
                    </Button>
                  )}
                </div>
                <div className="thumb-meta">
                  <div className="date">{s.takenAt ? dayjs(s.takenAt).format('YYYY-MM-DD') : dayjs(s.uploadedAt).format('YYYY-MM-DD')}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {previewImage && (
        <Modal
          open
          footer={null}
          onCancel={() => setPreviewImage(null)}
          width="auto"
          style={{ top: 20 }}
          centered
        >
          <img
            src={previewImage}
            alt=""
            style={{ maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain' }}
          />
        </Modal>
      )}
    </div>
  );
}