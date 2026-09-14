import type { FinancialStatus } from '@/types/domain'

interface StatusMeta {
  label: string
  emoji: string
  bg: string
  text: string
  dot: string
}

/** Central mapping so the status color is defined once and reused everywhere (ТЗ §6.2). */
export const STATUS_META: Record<FinancialStatus, StatusMeta> = {
  green: {
    label: 'Отлично',
    emoji: '🟢',
    bg: 'bg-status-green/15',
    text: 'text-status-green',
    dot: 'bg-status-green',
  },
  light_green: {
    label: 'Хорошо',
    emoji: '🟢',
    bg: 'bg-status-light-green/15',
    text: 'text-status-light-green',
    dot: 'bg-status-light-green',
  },
  yellow: {
    label: 'Внимание',
    emoji: '🟡',
    bg: 'bg-status-yellow/15',
    text: 'text-status-yellow',
    dot: 'bg-status-yellow',
  },
  orange: {
    label: 'Риск',
    emoji: '🟠',
    bg: 'bg-status-orange/15',
    text: 'text-status-orange',
    dot: 'bg-status-orange',
  },
  red: {
    label: 'Тревога',
    emoji: '🔴',
    bg: 'bg-status-red/15',
    text: 'text-status-red',
    dot: 'bg-status-red',
  },
}
