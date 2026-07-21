import { useState } from 'react';
import { Card, Input, Select, Typography, Table, Tag, Empty, Skeleton, Space, Button, Modal } from 'antd';
import { Search, BookOpen } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { birdsDbApi } from '../api';
import type { BirdsDBSpecies } from '../api';

export function BirdsDB() {
  const [search, setSearch] = useState('');
  const [family, setFamily] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const [selectedBird, setSelectedBird] = useState<BirdsDBSpecies | null>(null);

  const { data: families } = useQuery({
    queryKey: ['birds-db', 'families'],
    queryFn: birdsDbApi.families,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['birds-db', 'list', { q: search, family, page }],
    queryFn: () => birdsDbApi.list({ q: search || undefined, family, page }),
  });

  return (
    <div className="page-container">
      <Typography.Title level={3} className="page-title">鸟类数据库</Typography.Title>

      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input
            placeholder="搜索（中文名/学名/英文名）"
            allowClear
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            style={{ width: 240 }}
            prefix={<Search size={14} />}
          />
          <Select
            placeholder="按科筛选"
            allowClear
            value={family}
            onChange={(v) => { setFamily(v); setPage(1); }}
            style={{ width: 200 }}
            options={(families ?? []).map((f) => ({
              label: `${f.familyName} (${f.count})`,
              value: f.familyName,
            }))}
          />
        </Space>
      </Card>

      <Card>
        {isLoading ? (
          <Skeleton active />
        ) : !data?.items.length ? (
          <Empty description="未找到匹配的鸟类" />
        ) : (
          <>
            <Table
              rowKey="id"
              dataSource={data.items}
              pagination={{
                current: page,
                pageSize: data.pageSize,
                total: data.total,
                onChange: (p) => setPage(p),
                showSizeChanger: false,
              }}
              columns={[
                {
                  title: '中文名',
                  dataIndex: 'chineseName',
                  render: (v, r) => (
                    <a onClick={() => setSelectedBird(r)}>{v}</a>
                  ),
                },
                {
                  title: '学名',
                  dataIndex: 'scientificName',
                  render: (v) => <i style={{ color: '#666' }}>{v}</i>,
                },
                {
                  title: '英文名',
                  dataIndex: 'englishName',
                  render: (v) => <span style={{ color: '#888' }}>{v}</span>,
                },
                {
                  title: '科',
                  dataIndex: 'familyName',
                  render: (v) => <Tag>{v}</Tag>,
                },
                {
                  title: '目',
                  dataIndex: 'orderName',
                  width: 100,
                },
                {
                  title: '体长(cm)',
                  dataIndex: 'bodyLengthCm',
                  width: 100,
                },
                {
                  title: '保护',
                  dataIndex: 'conservation',
                  width: 100,
                  render: (v) => {
                    const color = v.includes('CR') ? 'red' : v.includes('EN') ? 'orange' : v.includes('VU') ? 'gold' : 'green';
                    return <Tag color={color}>{v}</Tag>;
                  },
                },
              ]}
            />
          </>
        )}
      </Card>

      {selectedBird && (
        <Modal
          open
          title={<Space><BookOpen size={16} />{selectedBird.chineseName}</Space>}
          onCancel={() => setSelectedBird(null)}
          footer={null}
          width={600}
        >
          <div style={{ lineHeight: 1.8 }}>
            <div><b>学名：</b><i>{selectedBird.scientificName}</i></div>
            <div><b>英文名：</b>{selectedBird.englishName}</div>
            <div><b>分类：</b>{selectedBird.orderName} &gt; {selectedBird.familyName} &gt; {selectedBird.genus}</div>
            <div><b>体长：</b>{selectedBird.bodyLengthCm} cm</div>
            <div><b>保护级别：</b><Tag color={selectedBird.conservation.includes('CR') ? 'red' : selectedBird.conservation.includes('EN') ? 'orange' : selectedBird.conservation.includes('VU') ? 'gold' : 'green'}>{selectedBird.conservation}</Tag></div>
          </div>
        </Modal>
      )}
    </div>
  );
}