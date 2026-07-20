import { useState, useEffect } from 'react';
import { Card, Form, Input, Button, Space, App, Typography, Alert, Switch, Tag, Skeleton, Modal } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { settingsApi, statsApi } from '../../api';
import { Eye, EyeOff, KeyRound, Save, RefreshCw, Wand2 } from 'lucide-react';

export function AISettings() {
  const qc = useQueryClient();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [showKey, setShowKey] = useState(false);
  const [fixing, setFixing] = useState(false);

  const { data, isLoading } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.list });
  const { data: summary } = useQuery({ queryKey: ['stats', 'summary'], queryFn: statsApi.summary });

  async function fixSpecies() {
    Modal.confirm({
      title: '确认修正物种数据',
      content: '将重新调用 AI 生成所有物种的中文分类信息（目/科/属/保护级别等），是否继续？',
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        setFixing(true);
        try {
          const result = await settingsApi.fixSpecies();
          message.success(`完成！成功 ${result.fixed} 个，失败 ${result.errors} 个`);
          qc.invalidateQueries({ queryKey: ['species'] });
        } catch (e: any) {
          message.error(e.message || '修正失败');
        } finally {
          setFixing(false);
        }
      },
    });
  }

  useEffect(() => {
    if (data) {
      const m: Record<string, any> = {};
      for (const s of data) {
        m[s.key] = s.isSecret ? '' : (s.masked || '');
      }
      form.setFieldsValue(m);
    }
  }, [data, form]);

  async function onSave(key: string) {
    try {
      const v = form.getFieldValue(key);
      await settingsApi.update(key, v ?? '');
      message.success('已保存');
      qc.invalidateQueries({ queryKey: ['settings'] });
    } catch (e: any) {
      message.error(e.message || '保存失败');
    }
  }

  function renderItem(key: string, label: string, type: 'text' | 'secret' | 'number' = 'text', tip?: string) {
    const item = data?.find((s) => s.key === key);
    return (
      <Form.Item
        key={key}
        label={
          <Space>
            <span>{label}</span>
            {item?.isSecret && <Tag color="orange" icon={<KeyRound size={10} />}>加密</Tag>}
            {item?.updatedAt && <span style={{ fontSize: 11, color: '#999', fontWeight: 'normal' }}>更新于 {new Date(item.updatedAt).toLocaleString()}</span>}
          </Space>
        }
        extra={tip}
      >
        <Space.Compact style={{ width: '100%', maxWidth: 600 }}>
          {type === 'secret' ? (
            <Form.Item name={key} noStyle>
              <Input.Password
                placeholder={item?.hasValue ? `已设置（${item.masked}）` : '请输入 API Key'}
                visibilityToggle={{
                  visible: showKey,
                  onVisibleChange: setShowKey,
                }}
              />
            </Form.Item>
          ) : (
            <Form.Item name={key} noStyle>
              <Input type={type === 'number' ? 'number' : 'text'} placeholder={item?.hasValue ? item.masked : ''} />
            </Form.Item>
          )}
          <Button type="primary" icon={<Save size={14} />} onClick={() => onSave(key)}>保存</Button>
        </Space.Compact>
      </Form.Item>
    );
  }

  return (
    <div className="page-container">
      <Typography.Title level={3} className="page-title">系统设置</Typography.Title>

      <Card title="AI 识别配置" style={{ marginBottom: 16 }}>
        {isLoading ? (
          <Skeleton active />
        ) : (
          <>
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message="AI 调用用于自动识别上传照片中的鸟类。仅管理员可修改此配置。"
              description="Key 加密存储在数据库中，前端永远不显示明文。"
            />
            <Form form={form} layout="vertical" requiredMark={false}>
              {renderItem('ai_api_key', 'API Key', 'secret', 'MiniMax API 的 Bearer Token，加密保存')}
              {renderItem('ai_base_url', 'Base URL', 'text', 'API 基础地址')}
              {renderItem('ai_model', '模型名', 'text', '默认 MiniMax-M3')}
              {renderItem('ai_timeout_ms', '超时（毫秒）', 'number')}
              {renderItem('ai_temperature', 'Temperature', 'number', '0~1，越低越确定')}
              {renderItem('ai_max_retries', '重试次数', 'number', '识别失败最大重试次数')}
            </Form>
          </>
        )}
      </Card>

      <Card title="站点设置">
        {isLoading ? (
          <Skeleton active />
        ) : (
          <Form form={form} layout="vertical" requiredMark={false}>
            {renderItem('site_name', '站点名称')}
            {renderItem('allow_registration', '开放注册', 'text', '1 = 允许，0 = 关闭（仅管理员创建）')}
            {renderItem('upload_max_mb', '单张大小限制（MB）', 'number')}
          </Form>
        )}
      </Card>

      <Card title="数据库状态" style={{ marginTop: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Space>
            <span>总记录：{summary?.totalSightings ?? 0}</span>
            <span>已识别物种：{summary?.speciesCount ?? 0}</span>
            <span>用户数：{summary?.userCount ?? 0}</span>
          </Space>
          <Button
            icon={<Wand2 size={14} />}
            loading={fixing}
            onClick={fixSpecies}
            style={{ marginTop: 8 }}
          >
            修正物种数据（目/科/属改中文，保护级别中英混排）
          </Button>
        </Space>
      </Card>
    </div>
  );
}