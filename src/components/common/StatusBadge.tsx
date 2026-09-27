import { Check, CircleDashed, RotateCcw } from 'lucide-react';
import type { LearningStatus } from '../../types/domain';

const statusDetails = {
  unlearned: { label: '未学習', Icon: CircleDashed },
  learning: { label: 'まだ', Icon: RotateCcw },
  remembered: { label: '覚えた', Icon: Check },
} satisfies Record<LearningStatus, { label: string; Icon: typeof Check }>;

export function StatusBadge({ status }: { status: LearningStatus }) {
  const { label, Icon } = statusDetails[status];
  return (
    <span className={`status-badge status-${status}`}>
      <Icon size={13} aria-hidden="true" />
      {label}
    </span>
  );
}
