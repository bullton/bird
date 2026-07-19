import { Card, Typography, Row, Col, Empty, Skeleton, Tag, List } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { statsApi } from '../api';
import { Bird, Calendar, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';

export function Stats() {
  const { data: summary, isLoading: l1 } = useQuery({ queryKey: ['stats', 'summary'], queryFn: statsApi.summary });
  const { data: timeline, isLoading: l2 } = useQuery({ queryKey: ['stats', 'timeline'], queryFn: () => statsApi.timeline() });
  const { data: families, isLoading: l3 } = useQuery({ queryKey: ['stats', 'families'], queryFn: statsApi.familyDistribution });
  const { data: topSpecies, isLoading: l4 } = useQuery({ queryKey: ['stats', 'top'], queryFn: statsApi.topSpecies });

  const year = new Date().getFullYear();
  const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
  const monthMap = new Map<string, number>();
  (timeline ?? []).forEach((t) => monthMap.set(t.month, t.count));
  const maxCount = Math.max(1, ...Array.from(monthMap.values()));

  return (
    <div className="page-container">
      <Typography.Title level={3} className="page-title">统计</Typography.Title>

      {l1 ? <Skeleton active /> : (
        <Row gutter={[16, 16]}>
          <Col xs={12} md={6}><Card><div className="muted">总记录</div><div style={{ fontSize: 28, fontWeight: 600 }}>{summary?.totalSightings ?? 0}</div></Card></Col>
          <Col xs={12} md={6}><Card><div className="muted">物种数</div><div style={{ fontSize: 28, fontWeight: 600, color: '#2d5a3d' }}>{summary?.speciesCount ?? 0}</div></Card></Col>
          <Col xs={12} md={6}><Card><div className="muted">已识别</div><div style={{ fontSize: 28, fontWeight: 600 }}>{summary?.identified ?? 0}</div></Card></Col>
          <Col xs={12} md={6}><Card><div className="muted">待处理</div><div style={{ fontSize: 28, fontWeight: 600, color: '#d48806' }}>{summary?.pending ?? 0}</div></Card></Col>
        </Row>
      )}

      <Card title={<><Calendar size={16} style={{ marginRight: 6 }} />{year} 年拍摄分布</>} style={{ marginTop: 16 }}>
        {l2 ? <Skeleton active /> : (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 160 }}>
            {months.map((m) => {
              const k = `${year}-${m}`;
              const c = monthMap.get(k) ?? 0;
              const h = Math.max(2, Math.round((c / maxCount) * 140));
              return (
                <div key={m} style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{
                    height: h,
                    background: c > 0 ? '#2d5a3d' : '#e0e0dc',
                    borderRadius: 4,
                    transition: 'height 0.3s',
                  }} title={`${c} 张`} />
                  <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>{m}</div>
                  <div style={{ fontSize: 11, fontWeight: 600 }}>{c}</div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} md={12}>
          <Card title={<><Bird size={16} style={{ marginRight: 6 }} />常见物种 Top 20</>}>
            {l4 ? <Skeleton active /> : (
              <List
                size="small"
                dataSource={topSpecies ?? []}
                renderItem={(s, i) => (
                  <List.Item>
                    <span style={{ width: 24, color: '#888' }}>{i + 1}</span>
                    <Link to={`/species/${s.speciesId}`} style={{ flex: 1 }}>
                      {s.chineseName || s.scientificName}
                    </Link>
                    <Tag>{s.familyName}</Tag>
                    <span style={{ fontWeight: 600, color: '#2d5a3d', minWidth: 40, textAlign: 'right' }}>{s.count}</span>
                  </List.Item>
                )}
                locale={{ emptyText: '暂无' }}
              />
            )}
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title={<><TrendingUp size={16} style={{ marginRight: 6 }} />科属分布</>}>
            {l3 ? <Skeleton active /> : (
              <List
                size="small"
                dataSource={(families ?? []).slice(0, 15)}
                renderItem={(f) => (
                  <List.Item>
                    <span style={{ flex: 1 }}>
                      {f.familyName}
                      <span style={{ color: '#888', marginLeft: 6, fontSize: 12 }}>{f.orderName}</span>
                    </span>
                    <span style={{ fontWeight: 600 }}>{f.count}</span>
                  </List.Item>
                )}
                locale={{ emptyText: '暂无' }}
              />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}