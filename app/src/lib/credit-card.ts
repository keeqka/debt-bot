/**
 * Кредитная карта: сколько ещё можно снять и что изменится от снятия. Чистые
 * функции — сам пересчёт плана и даты свободы делает общая симуляция
 * (lib/month.ts replan) на новых остатках, здесь только то, что специфично для карты.
 */

export interface CardLike {
  current_balance: number
  credit_limit: number | null
  interest_rate: number | null
}

/** Сколько осталось до лимита; null — лимит не задан (ограничения нет). */
export function cardAvailable(card: CardLike): number | null {
  return card.credit_limit == null ? null : Math.max(0, card.credit_limit - card.current_balance)
}

export interface DrawPreview {
  amount: number
  newBalance: number
  /** Сколько останется до лимита после снятия; null — лимит не задан. */
  availableAfter: number | null
  /** Снятие больше доступного — банк его не даст, и БД тоже откажет. */
  overLimit: boolean
  /** Сколько в месяц набежит процентов именно на снятую сумму. */
  monthlyInterest: number
}

export function previewDraw(card: CardLike, amount: number): DrawPreview {
  const a = Number.isFinite(amount) && amount > 0 ? amount : 0
  const available = cardAvailable(card)
  const newBalance = card.current_balance + a
  return {
    amount: a,
    newBalance,
    availableAfter: available == null ? null : Math.max(0, available - a),
    overLimit: available != null && a > available,
    monthlyInterest: Math.round((a * (card.interest_rate ?? 0)) / 100 / 12),
  }
}
