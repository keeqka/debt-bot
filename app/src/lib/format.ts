export function formatMoney(amount: number, currency = 'KZT') {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatDate(iso: string) {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(new Date(iso))
}

export function formatDateShort(iso: string) {
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(
    new Date(iso),
  )
}

export function formatPercent(value: number) {
  return new Intl.NumberFormat('ru-RU', { style: 'percent', maximumFractionDigits: 0 }).format(value)
}
