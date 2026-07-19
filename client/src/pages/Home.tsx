import { Row, Col, Card, Statistic, Typography, Empty, Skeleton, Space, Button } from 'antd';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { statsApi, sightingsApi } from '../api';
import { StatusBadge } from '../components/StatusBadge';
import { Camera, Bird, AlertCircle, CheckCircle2, Users } from 'lucide-react';
import dayjs from 'dayjs';

export function Home() {
  const { data: summary, isLoading } = useQuery({
    queryKey: ['stats', 'summary'],
    queryFn: statsApi.summary,
  });
  const { data: counts } = useQuery({
    queryKey: ['sightings', 'counts'],
    queryFn: sightingsApi.counts,
  });
  const { data: recent } = useQuery({
    queryKey: ['sightings', { page: 1 }],
    queryFn: () => sightingsApi.list({ page: 1 }),
  });

  return (
    <div className="page-container">
      <Typography.Title level={3} className="page-title">概览</Typography.Title>

      <Row gutter={[16, 16]}>
        <Col xs={12} sm={8} md={6}>
          <Card>
            <Statistic
              title="总记录数"
              value={summary?.totalSightings ?? 0}
              prefix={<Camera size={18} color="#2d5a3d" />}
              loading={isLoading}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={6}>
          <Card>
            <Statistic
              title="已识别物种"
              value={summary?.speciesCount ?? 0}
              prefix={<Bird size={18} color="#2d5a3d" />}
              loading={isLoading}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={6}>
          <Card>
            <Statistic
              title="待处理"
              value={summary?.pending ?? 0}
              prefix={<AlertCircle size={18} color="#d48806" />}
              loading={isLoading}
              valueStyle={{ color: (summary?.pending ?? 0) > 0 ? '#d48806' : undefined }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={6}>
          <Card>
            <Statistic
              title="已识别"
              value={summary?.identified ?? 0}
              prefix={<CheckCircle2 size={18} color="#389e0d" />}
              loading={isLoading}
            />
          </Card>
        </Col>
      </Row>

      <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>最近拍摄</Typography.Title>
        <Space>
          <Link to="/upload"><Button type="primary">上传照片</Button></Link>
          <Link to="/timeline"><Button>查看全部</Button></Link>
        </Space>
      </div>

      <div style={{ marginTop: 12 }}>
        {!recent ? (
          <Skeleton active />
        ) : recent.items.length === 0 ? (
          <Empty description="还没有记录，去上传第一张鸟片吧" />
        ) : (
          <div className="thumb-grid">
            {recent.items.slice(0, 12).map((s) => (
              <Link key={s.id} to={`/timeline?focus=${s.id}`} className="thumb-card">
                <img src={s.thumbUrl} alt={s.chineseName || s.scientificName || ''} loading="lazy" />
                <div className="thumb-meta">
                  <div className="name">{s.chineseName || s.scientificName || '未识别'}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                    <span className="date">
                      {s.takenAt ? dayjs(s.takenAt).format('YYYY-MM-DD') : ''}
                    </span>
                    <StatusBadge status={s.status} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {(counts?.failed ?? 0) > 0 && (
        <Card style={{ marginTop: 24, borderColor: '#ffccc7' }}>
          <Space>
            <AlertCircle size={20} color="#cf1322" />
            <span>有 <b>{counts?.failed}</b> 条记录识别失败</span>
            <Link to="/timeline?view=pending_only"><Button type="link">去处理 →</Button></Link>
          </Space>
        </Card>
      )}
    </div>
  );
}