import { useState } from 'react';
import { Card, Input, Select, Typography, Empty, Skeleton, Space, Tag, Segmented } from 'antd';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { speciesApi } from '../api';
import { Bird, Search } from 'lucide-react';

export function Gallery() {
  const [search, setSearch] = useState('');
  const [family, setFamily] = useState<string | undefined>();
  const [view, setView] = useState<'species' | 'photos'>('species');

  const { data: families } = useQuery({
    queryKey: ['species', 'families'],
    queryFn: speciesApi.families,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['species', { search, family, page: 1 }],
    queryFn: () => speciesApi.list({ q: search || undefined, family }),
  });

  return (
    <div className="page-container">
      <Typography.Title level={3} className="page-title">图库</Typography.Title>

      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input
            placeholder="搜索物种（中/英/学名）"
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 240 }}
            prefix={<Search size={14} />}
          />
          <Select
            placeholder="按科筛选"
            allowClear
            value={family}
            onChange={setFamily}
            style={{ width: 200 }}
            options={(families ?? []).filter((f) => f.familyName).map((f) => ({
              label: `${f.familyName} (${f.count})`,
              value: f.familyName!,
            }))}
          />
        </Space>
      </Card>

      {isLoading ? (
        <Skeleton active />
      ) : (data?.items.length ?? 0) === 0 ? (
        <Empty description="还没有物种记录" />
      ) : (
        <div className="thumb-grid">
          {data!.items.map((sp) => (
            <Link key={sp.id} to={`/species/${sp.id}`} className="thumb-card">
              <div style={{
                height: 180,
                background: 'linear-gradient(135deg, #e8f0e9 0%, #f5f3eb 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Bird size={48} color="#5a8a6d" />
              </div>
              <div className="thumb-meta">
                <div className="name">{sp.chineseName || sp.scientificName}</div>
                <div style={{ fontSize: 12, color: '#888', fontStyle: 'italic', marginTop: 2 }}>
                  {sp.scientificName}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                  {sp.familyName ? <Tag>{sp.familyName}</Tag> : <span />}
                  <span style={{ fontSize: 12, color: '#2d5a3d', fontWeight: 600 }}>
                    {sp.sightingCount ?? 0} 张
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}