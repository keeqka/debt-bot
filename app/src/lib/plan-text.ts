import type { DebtStrategy, PlanSettings, PriorityMode } from '@/lib/budget'

/** Что делает каждая стратегия — словами, без ИИ: это свойства метода, а не мнение. */
export const STRATEGY_META: Record<DebtStrategy, { label: string; first: string; why: string }> = {
  avalanche: {
    label: 'Лавина',
    first: 'Гасим первым — дороже всех по ставке',
    why: 'Свободные деньги идут в долг с самой высокой ставкой. Меньше всего переплата по процентам.',
  },
  snowball: {
    label: 'Снежный ком',
    first: 'Гасим первым — самый маленький остаток',
    why: 'Свободные деньги идут в самый маленький долг. Долги закрываются чаще, переплата обычно чуть больше, чем у лавины.',
  },
  cash_flow: {
    label: 'Поток',
    first: 'Гасим первым — освобождает больше денег в месяц',
    why: 'Первым гасится долг с наименьшим отношением остатка к платежу (Cash Flow Index): быстрее всего освобождаются ежемесячные деньги.',
  },
}

export const MODE_META: Record<PriorityMode, { label: string; short: string; description: string }> = {
  debts_first: {
    label: 'Сначала долги',
    short: 'всё свободное — в долги',
    description: 'Всё сверх обычных трат идёт в долги. После них — подушка, потом цели.',
  },
  cushion_first: {
    label: 'Сначала подушка',
    short: 'сначала резерв, потом долги',
    description: 'Сначала резерв на несколько месяцев расходов, потом долги. По долгам всё это время идут минимальные платежи.',
  },
  split: {
    label: 'Пополам',
    short: 'доля в долги, доля в накопления',
    description: 'Свободные деньги делятся: часть в долги, часть в накопления — подушка, потом цели.',
  },
  ladder: {
    label: 'По порядку',
    short: 'подушка 1 мес → дорогие долги → подушка → остальное',
    description:
      'Стартовая подушка на месяц, потом долги с высокой ставкой, потом полная подушка, потом дешёвые долги и цели. Классический порядок приоритетов.',
  },
}

/** Одна строка про настройки режима — для подписи под планом. */
export function modeSummary(settings: PlanSettings) {
  if (settings.mode === 'split') return `${MODE_META.split.label}: ${settings.splitDebtPct}% в долги, ${100 - settings.splitDebtPct}% в накопления`
  if (settings.mode === 'ladder') return `${MODE_META.ladder.label}: дорогие долги — от ${settings.highRateThreshold}%`
  if (settings.mode === 'cushion_first') return `${MODE_META.cushion_first.label}: резерв на ${settings.cushionMonths} мес.`
  return MODE_META.debts_first.label
}
