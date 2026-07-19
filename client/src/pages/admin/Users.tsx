import { useState } from 'react';
import { Card, Table, Button, Space, Tag, App, Modal, Form, Input, Select } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '../../api';
import { Plus, KeyRound, Trash2 } from 'lucide-react';
import dayjs from 'dayjs';
import type { User } from '../../types';

export function Users() {
  const qc = useQueryClient();
  const { message, modal } = App.useApp();
  const { data, isLoading } = useQuery({ queryKey: ['users'], queryFn: usersApi.list });
  const [createOpen, setCreateOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<User | null>(null);

  const [createForm] = Form.useForm();
  const [resetForm] = Form.useForm();

  async function onCreate() {
    try {
      const v = await createForm.validateFields();
      await usersApi.create(v);
      message.success('已创建');
      setCreateOpen(false);
      createForm.resetFields();
      qc.invalidateQueries({ queryKey: ['users'] });
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.message || '创建失败');
    }
  }

  async function onReset() {
    if (!resetTarget) return;
    try {
      const v = await resetForm.validateFields();
      await usersApi.resetPassword(resetTarget.id, v.newPassword);
      message.success(`已重置 ${resetTarget.username} 的密码`);
      setResetTarget(null);
      resetForm.resetFields();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.message || '重置失败');
    }
  }

  async function onToggleActive(u: User) {
    try {
      await usersApi.update(u.id, { isActive: !u.isActive });
      qc.invalidateQueries({ queryKey: ['users'] });
    } catch (e: any) {
      message.error(e?.message);
    }
  }

  async function onChangeRole(u: User, role: 'admin' | 'member') {
    try {
      await usersApi.update(u.id, { role });
      qc.invalidateQueries({ queryKey: ['users'] });
      message.success('已更新角色');
    } catch (e: any) {
      message.error(e?.message);
    }
  }

  function onDelete(u: User) {
    modal.confirm({
      title: `删除用户 ${u.username}？`,
      content: '此操作不可撤销。',
      okType: 'danger',
      onOk: async () => {
        try {
          await usersApi.remove(u.id);
          qc.invalidateQueries({ queryKey: ['users'] });
          message.success('已删除');
        } catch (e: any) {
          message.error(e?.message);
        }
      },
    });
  }

  return (
    <div className="page-container">
      <Card
        title="用户管理"
        extra={<Button type="primary" icon={<Plus size={14} />} onClick={() => setCreateOpen(true)}>新建用户</Button>}
      >
        <Table
          rowKey="id"
          loading={isLoading}
          dataSource={data ?? []}
          pagination={false}
          columns={[
            { title: '用户名', dataIndex: 'username' },
            { title: '显示名', dataIndex: 'displayName' },
            {
              title: '角色',
              dataIndex: 'role',
              width: 140,
              render: (v: 'admin' | 'member', r) => (
                <Select
                  value={v}
                  size="small"
                  style={{ width: 110 }}
                  onChange={(nv) => onChangeRole(r, nv)}
                  options={[
                    { value: 'admin', label: '管理员' },
                    { value: 'member', label: '成员' },
                  ]}
                />
              ),
            },
            {
              title: '状态',
              dataIndex: 'isActive',
              width: 100,
              render: (v: boolean, r) => (
                <Tag color={v ? 'green' : 'default'} onClick={() => onToggleActive(r)} style={{ cursor: 'pointer' }}>
                  {v ? '启用' : '已停用'}
                </Tag>
              ),
            },
            {
              title: '上次登录',
              dataIndex: 'lastLoginAt',
              width: 180,
              render: (v: string | null) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '从未',
            },
            {
              title: '操作',
              width: 200,
              render: (_, r) => (
                <Space>
                  <Button size="small" icon={<KeyRound size={12} />} onClick={() => setResetTarget(r)}>
                    重置密码
                  </Button>
                  <Button size="small" danger icon={<Trash2 size={12} />} onClick={() => onDelete(r)}>
                    删除
                  </Button>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Modal open={createOpen} title="新建用户" onCancel={() => setCreateOpen(false)} onOk={onCreate} okText="创建">
        <Form form={createForm} layout="vertical" requiredMark={false}>
          <Form.Item name="username" label="用户名" rules={[
            { required: true, message: '请输入' },
            { pattern: /^[a-zA-Z0-9_]{3,50}$/, message: '3-50 位字母数字下划线' },
          ]}>
            <Input autoFocus />
          </Form.Item>
          <Form.Item name="displayName" label="显示名">
            <Input placeholder="可选，留空则使用用户名" />
          </Form.Item>
          <Form.Item name="password" label="初始密码" rules={[{ required: true, min: 6, message: '至少 6 位' }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="role" label="角色" initialValue="member" rules={[{ required: true }]}>
            <Select options={[
              { value: 'member', label: '成员' },
              { value: 'admin', label: '管理员' },
            ]} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={!!resetTarget}
        title={`重置 ${resetTarget?.username} 的密码`}
        onCancel={() => setResetTarget(null)}
        onOk={onReset}
        okText="重置"
      >
        <Form form={resetForm} layout="vertical" requiredMark={false}>
          <Form.Item name="newPassword" label="新密码" rules={[{ required: true, min: 6, message: '至少 6 位' }]}>
            <Input.Password autoFocus />
          </Form.Item>
          <p style={{ color: '#888', fontSize: 12 }}>
            重置后该用户首次登录需修改密码。
          </p>
        </Form>
      </Modal>
    </div>
  );
}