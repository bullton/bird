import { useState } from 'react';
import { Form, Input, Button, Card, Typography, App, Space } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import { Bird } from 'lucide-react';
import { authApi } from '../api';
import { useAuth } from '../stores/auth';

export function Register() {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { load } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const onFinish = async (values: { username: string; password: string; displayName?: string }) => {
    setSubmitting(true);
    try {
      const me = await authApi.register(values.username, values.password, values.displayName);
      await load();
      if (me.mustChangePassword) {
        message.success('注册成功，请修改默认密码');
        navigate('/change-password', { replace: true });
      } else {
        message.success('注册成功');
        navigate('/', { replace: true });
      }
    } catch (err: any) {
      message.error(err.message || '注册失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #f0f7f2 0%, #fafaf7 100%)' }}>
      <Card style={{ width: 380, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
        <Space direction="vertical" size={4} style={{ width: '100%', textAlign: 'center', marginBottom: 24 }}>
          <Bird size={36} color="#2d5a3d" />
          <Typography.Title level={3} style={{ margin: 0 }}>注册账号</Typography.Title>
          <Typography.Text type="secondary">首个注册的用户将自动成为管理员</Typography.Text>
        </Space>

        <Form form={form} layout="vertical" onFinish={onFinish} requiredMark={false}>
          <Form.Item name="username" label="用户名"
            rules={[
              { required: true, message: '请输入用户名' },
              { min: 3, max: 50, message: '3-50 字符' },
              { pattern: /^[a-zA-Z0-9_]+$/, message: '只能包含字母数字下划线' },
            ]}>
            <Input size="large" autoFocus autoComplete="username" />
          </Form.Item>
          <Form.Item name="displayName" label="显示名（可选）">
            <Input size="large" placeholder="留空则使用用户名" />
          </Form.Item>
          <Form.Item name="password" label="密码"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 6, message: '至少 6 位' },
            ]}>
            <Input.Password size="large" autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="confirm"
            label="确认密码"
            dependencies={['password']}
            rules={[
              { required: true, message: '请再次输入密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) return Promise.resolve();
                  return Promise.reject(new Error('两次密码不一致'));
                },
              }),
            ]}>
            <Input.Password size="large" autoComplete="new-password" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" size="large" block loading={submitting}>
              注册
            </Button>
          </Form.Item>
        </Form>

        <div style={{ textAlign: 'center' }}>
          <Typography.Text type="secondary">
            已有账号？<Link to="/login">登录</Link>
          </Typography.Text>
        </div>
      </Card>
    </div>
  );
}