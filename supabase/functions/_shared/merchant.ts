// Ключ магазина для правил «этот магазин — всегда такая категория».
// Копия лежит в supabase/functions/_shared/merchant.ts — держать одинаковыми.

/** Юр. формы, города и служебные слова из выписок — они не отличают один магазин от другого. */
const NOISE = new Set([
  'too', 'тоо', 'ip', 'ип', 'ao', 'ао', 'ooo', 'ооо', 'llc', 'ltd',
  'kz', 'kzkz', 'almaty', 'astana', 'алматы', 'астана', 'shymkent', 'шымкент',
  'shop', 'store', 'kassa', 'kso', 'card',
])

/**
 * «MAGNUM.AF10.KASSA-13 ALMATY KZ» и «MAGNUM.AF2.KSO-7 ALMATY KZ» дают один
 * ключ «magnum af»: цифры, знаки и шумовые слова отбрасываются, остаются
 * первые два значимых слова. Пустая строка — ключа нет, правило не заводится.
 */
export function merchantKey(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw
    .toLowerCase()
    .replace(/[^a-zа-яё]+/g, ' ')
    .split(' ')
    .filter((t) => t.length > 1 && !NOISE.has(t))
    .slice(0, 2)
    .join(' ')
}

/** Правило, подходящее магазину: точный ключ, либо ключ правила — начало ключа магазина («magnum» → «magnum af»). */
export function findMerchantRule<T extends { merchant_key: string }>(rules: T[], raw: string | null | undefined): T | undefined {
  const key = merchantKey(raw)
  if (!key) return undefined
  return (
    rules.find((r) => r.merchant_key === key) ??
    rules.find((r) => key.startsWith(r.merchant_key + ' '))
  )
}
