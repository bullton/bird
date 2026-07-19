import { useRef, useState } from 'react';
import { Card, Typography, App, Button, Space, Progress, Tag, Empty } from 'antd';
import { Upload as UploadIcon, Camera, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { sightingsApi } from '../api';
import { useAuth } from '../stores/auth';

interface UploadItem {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'done' | 'failed';
  message?: string;
  progress: number;
}

const CONCURRENT = 3;

export function Upload() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [items, setItems] = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);

  const canUpload = !!user;

  const updateItem = (id: string, patch: Partial<UploadItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const doUpload = async (item: UploadItem) => {
    updateItem(item.id, { status: 'uploading', progress: 10 });
    try {
      await sightingsApi.upload(item.file);
      updateItem(item.id, { status: 'done', progress: 100 });
    } catch (err: any) {
      updateItem(item.id, { status: 'failed', message: err?.message ?? '上传失败' });
    }
  };

  const enqueue = (files: File[]) => {
    if (!canUpload) {
      message.warning('请先登录');
      navigate('/login');
      return;
    }
    const valid: File[] = [];
    for (const f of files) {
      if (!/\.(jpe?g)$/i.test(f.name) && f.type !== 'image/jpeg') {
        message.warning(`${f.name} 不是 JPEG 格式，已跳过`);
        continue;
      }
      if (f.size > 30 * 1024 * 1024) {
        message.warning(`${f.name} 超过 30MB，已跳过`);
        continue;
      }
      valid.push(f);
    }
    if (valid.length === 0) return;

    const newItems: UploadItem[] = valid.map((f) => ({
      id: Math.random().toString(36).slice(2),
      file: f,
      status: 'pending',
      progress: 0,
    }));
    setItems((prev) => [...prev, ...newItems]);

    runQueue(newItems);
  };

  const queueRef = useRef<UploadItem[]>([]);
  const runningRef = useRef(0);

  const runQueue = (initial: UploadItem[]) => {
    const all = [...queueRef.current, ...initial];
    queueRef.current = all;
    pump();
  };

  const pump = () => {
    while (runningRef.current < CONCURRENT && queueRef.current.length > 0) {
      const next = queueRef.current.shift();
      if (!next) break;
      if (next.status !== 'pending') continue;
      runningRef.current++;
      doUpload(next).finally(() => {
        runningRef.current--;
        pump();
      });
    }
  };

  const handleFiles = (list: FileList | null) => {
    if (!list) return;
    enqueue(Array.from(list));
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const clearDone = () => {
    setItems((prev) => prev.filter((it) => it.status !== 'done'));
  };

  return (
    <div className="page-container">
      <Typography.Title level={3} className="page-title">上传照片</Typography.Title>

      <Card>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          style={{
            border: `2px dashed ${dragging ? '#2d5a3d' : '#d9d9d9'}`,
            borderRadius: 8,
            padding: '48px 24px',
            textAlign: 'center',
            background: dragging ? '#f0f7f2' : '#fafafa',
            transition: 'all 0.15s',
          }}
        >
          <UploadIcon size={48} color="#2d5a3d" />
          <Typography.Title level={4} style={{ marginTop: 16, marginBottom: 8 }}>
            拖拽照片到此处，或点击下方按钮
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 24 }}>
            支持 JPEG / JPG 格式，单张最大 30MB。识别完成后可在相册中确认。
          </Typography.Paragraph>
          <Space>
            <Button
              type="primary"
              size="large"
              icon={<UploadIcon size={16} />}
              onClick={() => fileInputRef.current?.click()}
              disabled={!canUpload}
            >
              选择文件
            </Button>
            <Button
              size="large"
              icon={<Camera size={16} />}
              onClick={() => cameraInputRef.current?.click()}
              disabled={!canUpload}
            >
              拍照
            </Button>
          </Space>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,.jpg,.jpeg"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/jpeg"
            capture="environment"
            style={{ display: 'none' }}
            onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
          />
        </div>
      </Card>

      {items.length > 0 && (
        <Card
          title={
            <Space>
              <span>上传队列</span>
              <Button size="small" type="link" onClick={clearDone}>清除已完成</Button>
            </Space>
          }
          style={{ marginTop: 16 }}
        >
          {items.map((it) => (
            <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {it.file.name}
                  </span>
                  <Space size={4}>
                    {it.status === 'pending' && <Tag>等待中</Tag>}
                    {it.status === 'uploading' && <Tag color="processing">上传中</Tag>}
                    {it.status === 'done' && <Tag color="success">已完成</Tag>}
                    {it.status === 'failed' && <Tag color="error">{it.message ?? '失败'}</Tag>}
                  </Space>
                </div>
                {(it.status === 'uploading' || it.status === 'pending') && (
                  <Progress percent={it.status === 'uploading' ? 50 : 0} showInfo={false} size="small" />
                )}
              </div>
              <Button type="text" size="small" icon={<Trash2 size={14} />} onClick={() => removeItem(it.id)} />
            </div>
          ))}
        </Card>
      )}

      {!canUpload && (
        <Card style={{ marginTop: 16 }}>
          <Empty description="游客只读，请登录后再上传" />
        </Card>
      )}
    </div>
  );
}