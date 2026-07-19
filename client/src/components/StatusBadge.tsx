import { Tooltip } from 'antd';
import { Loader2, HelpCircle, CheckCircle2, Pencil, XCircle } from 'lucide-react';
import type { SightingStatus } from '../types';
import './StatusBadge.css';

const config: Record<SightingStatus, { text: string; className: string; icon: React.ReactNode }> = {
  pending:   { text: '识别中', className: 'status-pending',   icon: <Loader2 size={12} className="spin" /> },
  confirmed: { text: '已识别', className: 'status-confirmed', icon: <CheckCircle2 size={12} /> },
  corrected: { text: '已修正', className: 'status-corrected', icon: <Pencil size={12} /> },
  failed:    { text: '识别失败', className: 'status-failed',  icon: <XCircle size={12} /> },
};

export function StatusBadge({ status }: { status: SightingStatus }) {
  const c = config[status] ?? config.pending;
  return (
    <Tooltip title={c.text}>
      <span className={`status-badge ${c.className}`}>
        {c.icon}
        <span>{c.text}</span>
      </span>
    </Tooltip>
  );
}

export function LowConfidenceBadge() {
  return (
    <Tooltip title="AI 置信度较低，请手动确认">
      <span className="status-badge status-pending">
        <HelpCircle size={12} />
        <span>待确认</span>
      </span>
    </Tooltip>
  );
}