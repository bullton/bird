import { useState } from 'react';
import { Form, Input, Button, Card, Typography, App, Space } from 'antd';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../stores/auth';
import { Bird } from 'lucide-react';

export function Login() {
  const { login, loading } = useAuth();
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const location = useLocation();
  const { message } = App.useApp();
  const [submitting, setSubmitting] = useState(false);

  const onFinish = async (values: { username: string; password: string }) => {
    setSubmitting(true);
    try {
      await login(values.username, values.password);
      const state = useAuth.getState();
      if (state.user?.mustChangePassword) {
        navigate('/change-password', { replace: true });
        return;
      }
      const from = (location.state as any)?.from?.pathname || '/';
      navigate(from, { replace: true });
    } catch (err: any) {
      message.error(err.message || '登录失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #f0f7f2 0%, #fafaf7 100%)' }}>
      <Card style={{ width: 380, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
        <Space direction="vertical" size={4} style={{ width: '100%', textAlign: 'center', marginBottom: 24 }}>
          <Bird size={36} color="#2d5a3d" />
          <Typography.Title level={3} style={{ margin: 0 }}>家庭鸟类图鉴</Typography.Title>
          <Typography.Text type="secondary">登录以查看完整功能</Typography.Text>
        </Space>

        <Form form={form} layout="vertical" onFinish={onFinish} requiredMark={false}>
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input size="large" placeholder="用户名" autoFocus autoComplete="username" />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password size="large" placeholder="密码" autoComplete="current-password" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" size="large" block loading={submitting || loading}>
              登录
            </Button>
          </Form.Item>
        </Form>

        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <Typography.Text type="secondary">
            还没账号？<Link to="/register">注册</Link>
          </Typography.Text>
        </div>
      </Card>
    </div>
  );
}