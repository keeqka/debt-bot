// Подписка звёздами Telegram. Цена считалась от себестоимости ИИ на семью и
// курса вывода звёзд ($0.013 за ⭐): 500 ⭐ ≈ $6.5 разработчику, ≈ 4 400 ₸
// пользователю. Telegram разрешает у подписок только период 30 дней и цену
// до 2 500 ⭐.

export const STARS_PRICE = 500
export const SUBSCRIPTION_PERIOD_SECONDS = 2592000

export interface InvoicePayload {
  householdId: string
  userId: string
}

/** invoice_payload у Telegram — до 128 байт: два uuid и короткие ключи влезают. */
export function encodePayload(p: InvoicePayload): string {
  return JSON.stringify({ h: p.householdId, u: p.userId })
}

export function decodePayload(raw: string): InvoicePayload | null {
  try {
    const { h, u } = JSON.parse(raw)
    return typeof h === 'string' && typeof u === 'string' ? { householdId: h, userId: u } : null
  } catch {
    return null
  }
}
