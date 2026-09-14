// Every AI prompt in this app must state the household's currency
// explicitly — Claude has no other way to know it, and left to guess it
// defaults to rubles (the common assumption for Russian-language prompts),
// which is wrong for a Kazakhstan household. There's no dedicated settings
// table yet, so the currency is read straight from the data: debts are the
// most reliable signal (nearly always present, rarely mixed-currency),
// falling back to expenses, then the KZT default used everywhere else in
// the app (see app/src/lib/format.ts, mock-data.ts, dialog defaults).

// deno-lint-ignore no-explicit-any
type SupabaseLike = any

export async function resolveBaseCurrency(supabase: SupabaseLike): Promise<string> {
  const { data: debt } = await supabase.from('debts').select('currency').limit(1).maybeSingle()
  if (debt?.currency) return debt.currency

  const { data: expense } = await supabase.from('expenses').select('currency').limit(1).maybeSingle()
  if (expense?.currency) return expense.currency

  return 'KZT'
}

export function currencyInstruction(currency: string): string {
  return `Все суммы указаны в валюте ${currency}. Всегда указывай именно её (код ${currency}) в любом тексте — никогда не переводи в рубли или другую валюту и не называй их "руб"/"₽", если только валюта явно не RUB.`
}
