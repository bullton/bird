import { useState } from 'react';
import { Modal, Button, Radio, Space, Typography, message } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import type { IdentificationCandidate, Sighting } from '../types';
import { sightingsApi, speciesApi } from '../api';
import { useNavigate } from 'react-router-dom';

interface Props {
  sighting: Sighting;
  open: boolean;
  onClose: () => void;
}

export function IdentifyResultModal({ sighting, open, onClose }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [customName, setCustomName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const candidates: IdentificationCandidate[] = sighting.identification || [];
  const top = candidates[0];
  const needsConfirm = sighting.status === 'pending' && top && sighting.confidenceMax !== null && sighting.confidenceMax < 0.7;

  async function submit(idx: number | null) {
    setSubmitting(true);
    try {
      let speciesId: number | null = null;
      if (idx !== null && candidates[idx]) {
        const c = candidates[idx];
        const found = await findOrCreateSpecies(c);
        speciesId = found;
      } else if (customName.trim()) {
        const found = await findOrCreateSpecies({
          scientific_name: customName.trim(),
          chinese_name: customName.trim(),
          confidence: 1,
        } as IdentificationCandidate);
        speciesId = found;
      }
      if (!speciesId) {
        message.error('请选择一个候选或输入物种名');
        setSubmitting(false);
        return;
      }
      await sightingsApi.confirm(sighting.id, speciesId);
      message.success('已确认');
      qc.invalidateQueries({ queryKey: ['sightings'] });
      qc.invalidateQueries({ queryKey: ['sighting', sighting.id] });
      onClose();
    } catch (err: any) {
      message.error(err.message || '操作失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function reidentify() {
    setSubmitting(true);
    try {
      await sightingsApi.reidentify(sighting.id);
      message.info('已加入重试队列');
      qc.invalidateQueries({ queryKey: ['sightings'] });
      onClose();
    } catch (err: any) {
      message.error(err.message || '重试失败');
    } finally {
      setSubmitting(false);
    }
  }

  if (!needsConfirm && sighting.status === 'pending') {
    return (
      <Modal open={open} onCancel={onClose} footer={null} title="识别中">
        <Typography.Paragraph>
          正在等待 AI 识别结果，可稍后回来查看，或点击重试。
        </Typography.Paragraph>
        <Space>
          <Button onClick={onClose}>关闭</Button>
          <Button loading={submitting} onClick={reidentify}>重新识别</Button>
        </Space>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="请确认识别结果"
      footer={null}
      className="identify-popover"
      destroyOnClose
    >
      <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
        AI 给出了以下候选，请选择正确的物种。
      </Typography.Paragraph>
      <Radio.Group
        value={selectedIdx}
        onChange={(e) => setSelectedIdx(e.target.value)}
        style={{ width: '100%' }}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          {candidates.map((c, i) => (
            <Radio key={i} value={i} style={{ display: 'block', padding: '6px 0' }}>
              <Space direction="vertical" size={0}>
                <Space>
                  <strong>{c.chinese_name || c.scientific_name}</strong>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {c.scientific_name}
                  </Typography.Text>
                </Space>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  置信度 {(c.confidence * 100).toFixed(1)}%
                  {c.family_name ? ` · ${c.family_name}` : ''}
                </Typography.Text>
              </Space>
            </Radio>
          ))}
        </Space>
      </Radio.Group>

      <div style={{ marginTop: 16, borderTop: '1px solid #eee', paddingTop: 12 }}>
        <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
          以上都不对？手动输入：
        </Typography.Paragraph>
        <Space.Compact style={{ width: '100%' }}>
          <input
            type="text"
            placeholder="中文名或学名"
            value={customName}
            onChange={(e) => { setCustomName(e.target.value); setSelectedIdx(null); }}
            style={{ flex: 1, padding: '4px 8px', border: '1px solid #d9d9d9', borderRadius: 6 }}
          />
        </Space.Compact>
      </div>

      <div style={{ marginTop: 16, textAlign: 'right' }}>
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button onClick={reidentify} loading={submitting}>重新识别</Button>
          <Button
            type="primary"
            loading={submitting}
            disabled={selectedIdx === null && !customName.trim()}
            onClick={() => submit(selectedIdx)}
          >
            确认
          </Button>
        </Space>
      </div>
    </Modal>
  );
}

async function findOrCreateSpecies(c: IdentificationCandidate): Promise<number> {
  if (c.scientific_name) {
    try {
      const list = await speciesApi.list({ q: c.scientific_name });
      const hit = list.items.find((s) => s.scientificName.toLowerCase() === c.scientific_name.toLowerCase());
      if (hit) return hit.id;
    } catch {}
  }
  const created = await speciesApi.create({
    scientificName: c.scientific_name || c.chinese_name || 'Unknown',
    chineseName: c.chinese_name ?? undefined,
    englishName: c.english_name ?? undefined,
    orderName: c.order_name ?? undefined,
    familyName: c.family_name ?? undefined,
    genus: c.genus ?? undefined,
    conservation: c.conservation ?? undefined,
    bodyLengthCm: c.body_length_cm ?? undefined,
  });
  return created.id;
}