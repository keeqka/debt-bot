import { budgetPeriod } from '@/lib/budget'
import { MONTH_NAMES, periodLabel } from '@/lib/month'

/** Бюджетный месяц для фильтра: back = 0 — текущий, 1 — прошлый и т.д. (границы включительно). */
export interface PeriodOption {
  back: number
  start: string
  end: string
  label: string
}

const MAX_BACK = 120

/**
 * Месяцы, в которых есть записи, плюс текущий (он всегда первый): календарные
 * или от дня зарплаты — как выбрано в настройках, чтобы «Чеки», «Обзор» и
 * «Выписка» делили время одинаково. Запись с будущей датой считается текущим месяцем.
 */
export function periodOptions(dates: string[], startDay: number | null, today = new Date()): PeriodOption[] {
  const cache = new Map<number, ReturnType<typeof budgetPeriod>>()
  const periodAt = (back: number) => {
    let p = cache.get(back)
    if (!p) cache.set(back, (p = budgetPeriod(today, startDay, back)))
    return p
  }

  const backs = new Set<number>([0])
  for (const raw of dates) {
    const day = raw.slice(0, 10)
    let back = 0
    while (back < MAX_BACK && periodAt(back).start > day) back++
    backs.add(back)
  }

  const year = today.getFullYear()
  return [...backs]
    .sort((a, b) => a - b)
    .map((back) => {
      const { start, end } = periodAt(back)
      const sameYear = Number(start.slice(0, 4)) === year
      const label =
        startDay == null
          ? `${MONTH_NAMES[Number(start.slice(5, 7)) - 1]}${sameYear ? '' : ` ${start.slice(0, 4)}`}`
          : periodLabel(start, end)
      return { back, start, end, label }
    })
}

/** Попадает ли дата в выбранный месяц; текущий открыт вперёд — будущие записи остаются в нём. */
export function inPeriod(iso: string, p: PeriodOption): boolean {
  const day = iso.slice(0, 10)
  return day >= p.start && (p.back === 0 || day <= p.end)
}
