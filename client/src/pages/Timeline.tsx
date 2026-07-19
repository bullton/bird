import { useState } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Button, Space, Typography, Segmented, Skeleton, Empty, Input, App } from 'antd';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { sightingsApi } from '../api';
import { StatusBadge, LowConfidenceBadge } from '../components/StatusBadge';
import { IdentifyResultModal } from '../components/IdentifyResultModal';
import type { Sighting } from '../types';
import dayjs from 'dayjs';
import { RotateCw } from 'lucide-react';
import { useAuth } from '../stores/auth';

export function Timeline() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const { message } = App.useApp();
  const [view, setView] = useState<'all' | 'pending_only' | 'identified'>(
    (params.get('view') as any) || 'all'
  );
  const [focusId, setFocusId] = useState<number | null>(
    params.get('focus') ? parseInt(params.get('focus')!, 10) : null
  );
  const [modalItem, setModalItem] = useState<Sighting | null>(null);

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['sightings', { view }],
    queryFn: ({ pageParam = 1 }) => sightingsApi.list({ page: pageParam, view }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
    refetchInterval: 5000,
  });

  const items: Sighting[] = data?.pages.flatMap((p) => p.items) ?? [];
  const grouped = groupByMonth(items);

  async function reidentify(id: number) {
    try {
      await sightingsApi.reidentify(id);
      message.success('已加入重试队列');
      qc.invalidateQueries({ queryKey: ['sightings'] });
    } catch (e: any) {
      message.error(e.message || '重试失败');
    }
  }

  return (
    <div className="page-container">
      <Typography.Title level={3} className="page-title">时间线</Typography.Title>

      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Segmented
            value={view}
            onChange={(v) => { setView(v as any); setParams({ view: v as string }); }}
            options={[
              { label: '全部', value: 'all' },
              { label: '待处理', value: 'pending_only' },
              { label: '已识别', value: 'identified' },
            ]}
          />
        </Space>
      </Card>

      {isLoading ? (
        <Skeleton active />
      ) : items.length === 0 ? (
        <Empty description="暂无记录" />
      ) : (
        <>
          {Object.entries(grouped).map(([month, list]) => (
            <div key={month} className="timeline-group">
              <div className="timeline-month">{month}</div>
              <div className="thumb-grid">
                {list.map((s) => (
                  <div key={s.id} className="thumb-card" onClick={() => {
                    if (s.status === 'pending' && s.identification && s.confidenceMax !== null && s.confidenceMax < 0.7) {
                      setModalItem(s);
                    } else if (s.status === 'failed') {
                      reidentify(s.id);
                    } else if (focusId === s.id) {
                      setFocusId(null);
                    } else {
                      setFocusId(s.id);
                    }
                  }}>
                    <img src={s.thumbUrl} alt="" loading="lazy" />
                    <div className="thumb-meta">
                      <div className="name">
                        {s.chineseName || s.scientificName || '未识别'}
                        {s.status === 'pending' && s.identification && s.confidenceMax !== null && s.confidenceMax < 0.7 && (
                          <LowConfidenceBadge />
                        )}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                        <span className="date">
                          {s.takenAt ? dayjs(s.takenAt).format('MM-DD HH:mm') : dayjs(s.uploadedAt).format('MM-DD')}
                        </span>
                        <Space size={4}>
                          <StatusBadge status={s.status} />
                          {s.status === 'failed' && (
                            <Button
                              type="text"
                              size="small"
                              icon={<RotateCw size={12} />}
                              onClick={(e) => { e.stopPropagation(); reidentify(s.id); }}
                            />
                          )}
                        </Space>
                      </div>
                      {focusId === s.id && (
                        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed #eee' }}>
                          <SightingDetail sighting={s} onClose={() => setFocusId(null)} canEdit={!!user} />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {hasNextPage && (
            <div style={{ textAlign: 'center', margin: '24px 0' }}>
              <Button onClick={() => fetchNextPage()} loading={isFetchingNextPage}>
                加载更多
              </Button>
            </div>
          )}
        </>
      )}

      {modalItem && (
        <IdentifyResultModal sighting={modalItem} open onClose={() => setModalItem(null)} />
      )}
    </div>
  );
}

function groupByMonth(items: Sighting[]): Record<string, Sighting[]> {
  const m: Record<string, Sighting[]> = {};
  for (const s of items) {
    const key = s.takenAt ? dayjs(s.takenAt).format('YYYY 年 MM 月') : '未分类';
    if (!m[key]) m[key] = [];
    m[key].push(s);
  }
  return m;
}

function SightingDetail({ sighting, canEdit, onClose }: { sighting: Sighting; canEdit: boolean; onClose: () => void }) {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [note, setNote] = useState(sighting.userNote || '');
  const [editing, setEditing] = useState(false);

  async function save() {
    try {
      await sightingsApi.update(sighting.id, { userNote: note });
      message.success('已保存');
      setEditing(false);
    } catch (e: any) { message.error(e.message); }
  }

  async function toggleFavorite() {
    try {
      await sightingsApi.update(sighting.id, { isFavorite: !sighting.isFavorite });
      message.success('已更新');
    } catch (e: any) { message.error(e.message); }
  }

  async function del() {
    if (!confirm('确定删除此记录？')) return;
    try {
      await sightingsApi.remove(sighting.id);
      message.success('已删除');
      onClose();
    } catch (e: any) { message.error(e.message); }
  }

  return (
    <div onClick={(e) => e.stopPropagation()}>
      {sighting.scientificName && (
        <div style={{ fontSize: 12, color: '#888' }}>
          <i>{sighting.scientificName}</i>
        </div>
      )}
      {sighting.familyName && (
        <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
          {sighting.familyName}
        </div>
      )}
      {sighting.speciesId && (
        <Button type="link" size="small" style={{ padding: 0 }} onClick={() => navigate(`/species/${sighting.speciesId}`)}>
          查看物种详情 →
        </Button>
      )}
      {canEdit && (
        <div style={{ marginTop: 8 }}>
          {editing ? (
            <Space.Compact style={{ width: '100%' }}>
              <Input.TextArea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                autoSize={{ minRows: 1, maxRows: 4 }}
                placeholder="备注…"
              />
              <Button type="primary" onClick={save}>保存</Button>
            </Space.Compact>
          ) : (
            <Typography.Paragraph
              type={sighting.userNote ? undefined : 'secondary'}
              style={{ fontSize: 12, margin: 0, cursor: 'pointer' }}
              onClick={() => setEditing(true)}
            >
              {sighting.userNote || '+ 添加备注'}
            </Typography.Paragraph>
          )}
          <Space size={4} style={{ marginTop: 6 }}>
            <Button size="small" onClick={toggleFavorite}>
              {sighting.isFavorite ? '★ 收藏' : '☆ 收藏'}
            </Button>
            <Button size="small" danger onClick={del}>删除</Button>
          </Space>
        </div>
      )}
    </div>
  );
}