import { useState } from 'react';
import { Form, Input, Button, Card, Typography, App, Space } from 'antd';
import { Bird } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api';
import { useAuth } from '../stores/auth';

export function ChangePassword() {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { user, load } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const requireChange = !!user?.mustChangePassword;

  const onFinish = async (values: { oldPassword?: string; newPassword: string }) => {
    setSubmitting(true);
    try {
      if (requireChange) {
        if (!values.oldPassword) {
          message.error('请输入旧密码');
          return;
        }
        await authApi.changePassword(values.oldPassword, values.newPassword);
      } else {
        if (!values.oldPassword) {
          message.error('请输入当前密码');
          return;
        }
        await authApi.changePassword(values.oldPassword, values.newPassword);
      }
      await load();
      message.success('密码修改成功');
      navigate('/', { replace: true });
    } catch (err: any) {
      message.error(err.message || '修改失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #f0f7f2 0%, #fafaf7 100%)' }}>
      <Card style={{ width: 380, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
        <Space direction="vertical" size={4} style={{ width: '100%', textAlign: 'center', marginBottom: 24 }}>
          <Bird size={36} color="#2d5a3d" />
          <Typography.Title level={3} style={{ margin: 0 }}>
            {requireChange ? '首次登录请修改密码' : '修改密码'}
          </Typography.Title>
          {requireChange && (
            <Typography.Text type="warning">
              检测到首次登录，必须修改密码后才能继续使用
            </Typography.Text>
          )}
        </Space>

        <Form form={form} layout="vertical" onFinish={onFinish} requiredMark={false}>
          <Form.Item name="oldPassword" label="当前密码" rules={[{ required: true, message: '请输入当前密码' }]}>
            <Input.Password size="large" autoFocus autoComplete="current-password" />
          </Form.Item>
          <Form.Item name="newPassword" label="新密码"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 6, message: '至少 6 位' },
            ]}>
            <Input.Password size="large" autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="confirm"
            label="确认新密码"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: '请再次输入新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) return Promise.resolve();
                  return Promise.reject(new Error('两次密码不一致'));
                },
              }),
            ]}>
            <Input.Password size="large" autoComplete="new-password" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" size="large" block loading={submitting}>
              提交
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}