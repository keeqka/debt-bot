/**
 * currencyDisplay: 'narrowSymbol' — иначе Intl для KZT в ru-RU печатает код
 * «773 100 KZT», а не «773 100 ₸». В макете везде знак, не код: код валюты
 * рядом с 34-пиксельной цифрой читается как технический мусор.
 */
export function formatMoney(amount: number, currency = 'KZT') {
  try {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${amount} ${currency}`
  }
}

/** Компактная сумма для тесных мест (главная цифра, оси графиков): 1,1 млн ₸. */
export function formatMoneyCompact(amount: number, currency = 'KZT') {
  const abs = Math.abs(amount)
  if (abs >= 1_000_000) {
    const millions = (amount / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1).replace('.', ',')
    return `${millions} млн ${currencySymbol(currency)}`
  }
  return formatMoney(amount, currency)
}

/**
 * Ещё короче, чем compact: тысячи тоже сворачиваются («540 тыс ₸»). Только для
 * тесных строк списка, где сумма делит ряд с названием. Главную цифру экрана
 * так печатать нельзя — «386 тыс ₸» вместо «386 000 ₸» отнимает точность там,
 * где место есть.
 */
export function formatMoneyShort(amount: number, currency = 'KZT') {
  const abs = Math.abs(amount)
  if (abs >= 1_000_000) return formatMoneyCompact(amount, currency)
  if (abs >= 100_000) {
    const thousands = Math.round(amount / 1_000)
    return `${new Intl.NumberFormat('ru-RU').format(thousands)} тыс ${currencySymbol(currency)}`
  }
  return formatMoney(amount, currency)
}

export function currencySymbol(currency = 'KZT') {
  try {
    const parts = new Intl.NumberFormat('ru-RU', { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }).formatToParts(0)
    return parts.find((p) => p.type === 'currency')?.value ?? currency
  } catch {
    return currency
  }
}

export function formatDate(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  try {
    return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
  } catch {
    return iso
  }
}

export function formatDateShort(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  try {
    return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(date)
  } catch {
    return iso
  }
}

/**
 * "август 2026" for a payoff date — `estimated_payoff_date` comes from
 * Claude (debts-strategy edge function), not a deterministic computation,
 * so it isn't guaranteed to be a parseable date (e.g. a debt whose minimum
 * payment doesn't cover its own interest has no real payoff date at all).
 * Never feed an unchecked value straight into Intl.DateTimeFormat — an
 * Invalid Date throws "date value is not finite", which crashes the whole
 * screen (this is a real production crash this guarded, not hypothetical).
 */
export function formatMonthYear(iso: string | null | undefined, fallback = 'дата не определена') {
  if (!iso) return fallback
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return fallback
  try {
    return new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(date)
  } catch {
    return fallback
  }
}

export function formatPercent(value: number) {
  try {
    return new Intl.NumberFormat('ru-RU', { style: 'percent', maximumFractionDigits: 0 }).format(value)
  } catch {
    return `${Math.round(value * 100)}%`
  }
}
