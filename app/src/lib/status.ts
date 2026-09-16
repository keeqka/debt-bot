import type { FinancialStatus } from '@/types/domain'

interface StatusMeta {
  label: string
  /** Текст на тёмном фоне. */
  text: string
  /** Заливка точки/полосы. */
  dot: string
  /** Подложка карточки. */
  bg: string
}

/**
 * Пять статусов из ТЗ остаются как данные, но в цвете сведены к трём тонам
 * палитры: ok / warn / alarm. Пять произвольных цветов (зелёный, салатовый,
 * жёлтый, оранжевый, красный) ломали правило «тревожный цвет максимум один раз
 * на экран» — на «Обзоре» под баннером уже есть красная категория и
 * инсайт-карточка. Числовой score всё ещё показывается рядом, так что
 * разрешение шкалы не теряется.
 *
 * Эмодзи убраны: в дизайне их нет ни в одном состоянии.
 */
export const STATUS_META: Record<FinancialStatus, StatusMeta> = {
  green: {
    label: 'Отлично',
    text: 'text-status-ok',
    dot: 'bg-status-ok',
    bg: 'bg-status-ok/12',
  },
  light_green: {
    label: 'Хорошо',
    text: 'text-status-ok',
    dot: 'bg-status-ok',
    bg: 'bg-status-ok/12',
  },
  yellow: {
    label: 'Внимание',
    text: 'text-status-warn',
    dot: 'bg-status-warn',
    bg: 'bg-status-warn/12',
  },
  orange: {
    label: 'Риск',
    text: 'text-status-warn',
    dot: 'bg-status-warn',
    bg: 'bg-status-warn/12',
  },
  red: {
    label: 'Тревога',
    text: 'text-status-alarm',
    dot: 'bg-status-alarm',
    bg: 'bg-status-alarm/12',
  },
}
