import { useState } from 'react';
import { Card, Input, Select, Typography, Empty, Skeleton, Space, Tag, Table, Button } from 'antd';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { speciesApi } from '../api';
import { Search } from 'lucide-react';

export function SpeciesList() {
  const [search, setSearch] = useState('');
  const [family, setFamily] = useState<string | undefined>();

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
      <Typography.Title level={3} className="page-title">我的图鉴</Typography.Title>

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
        <Card>
          <Table
            rowKey="id"
            dataSource={data!.items}
            pagination={{ pageSize: 30, showSizeChanger: false }}
            columns={[
              {
                title: '中文名',
                dataIndex: 'chineseName',
                render: (v: string | null, r) => (
                  <Link to={`/species/${r.id}`}>
                    {v || <i>{r.scientificName}</i>}
                  </Link>
                ),
              },
              {
                title: '学名',
                dataIndex: 'scientificName',
                render: (v: string) => <i style={{ color: '#666' }}>{v}</i>,
              },
              { title: '科', dataIndex: 'familyName', render: (v: string | null) => v ? <Tag>{v}</Tag> : '-' },
              { title: '属', dataIndex: 'genus', render: (v: string | null) => v || '-' },
              { title: '保护级别', dataIndex: 'conservation', width: 100, render: (v: string | null) => v || '-' },
              {
                title: '拍摄数',
                dataIndex: 'sightingCount',
                width: 100,
                render: (v: number) => <b style={{ color: '#2d5a3d' }}>{v ?? 0}</b>,
              },
              {
                title: '操作',
                width: 100,
                render: (_, r) => <Link to={`/species/${r.id}`}><Button type="link" size="small">详情</Button></Link>,
              },
            ]}
          />
        </Card>
      )}
    </div>
  );
}