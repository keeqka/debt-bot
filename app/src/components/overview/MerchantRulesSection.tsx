import { toast } from 'sonner'
import { X } from 'lucide-react'
import { useCategories, useDeleteMerchantRule, useExpenses, useMerchantRules, useUpdateExpensesCategory } from '@/hooks/use-finance-data'
import { findMerchantRule } from '@/lib/merchant'

/**
 * Правила магазинов: «этот магазин — всегда эта категория». Заводятся сами,
 * когда пользователь меняет категорию в чеке, выписке или карточке траты;
 * здесь их видно и можно удалить, а старые траты — перекатегоризировать разом.
 */
export function MerchantRulesSection() {
  const { data: rules = [] } = useMerchantRules()
  const { data: categories = [] } = useCategories()
  const { data: expenses = [] } = useExpenses()
  const deleteRule = useDeleteMerchantRule()
  const updateMany = useUpdateExpensesCategory()

  if (rules.length === 0) return null

  const nameOf = (id: string) => categories.find((c) => c.id === id)?.name ?? '—'

  // Траты, чей магазин подпадает под правило, но лежат в другой категории.
  const mismatched = new Map<string, string[]>()
  for (const e of expenses) {
    const rule = findMerchantRule(rules, e.merchant)
    if (rule && rule.category_id !== e.category_id) mismatched.set(rule.category_id, [...(mismatched.get(rule.category_id) ?? []), e.id])
  }
  const mismatchedCount = [...mismatched.values()].reduce((s, ids) => s + ids.length, 0)

  async function applyToOld() {
    for (const [categoryId, ids] of mismatched) await updateMany.mutateAsync({ ids, categoryId })
    toast.success(`Перекатегоризировано трат: ${mismatchedCount}`)
  }

  return (
    <div className="space-y-3 border-t border-hf-line pt-4">
      <div className="space-y-1">
        <p className="text-[13px] font-medium text-hf-text">Правила магазинов</p>
        <p className="text-[11px] leading-snug text-hf-text-4">
          Появляются, когда ты меняешь категорию у траты. Новые чеки и выписки с этими магазинами сразу идут в нужную категорию.
        </p>
      </div>
      <ul className="space-y-1.5">
        {rules.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2 rounded-[12px] bg-hf-card px-3 py-2.5">
            <span className="min-w-0 truncate text-[13px] text-hf-text-2">
              {r.merchant_label} <span className="text-hf-text-4">→</span> {nameOf(r.category_id)}
            </span>
            <button
              type="button"
              onClick={() => deleteRule.mutate(r.id)}
              aria-label={`Удалить правило ${r.merchant_label}`}
              className="shrink-0 text-hf-text-4"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
      {mismatchedCount > 0 && (
        <button
          type="button"
          onClick={applyToOld}
          disabled={updateMany.isPending}
          className="w-full rounded-[12px] bg-hf-card py-2.5 text-[13px] text-hf-accent-on-dark disabled:opacity-50"
        >
          Применить к уже записанным тратам ({mismatchedCount})
        </button>
      )}
    </div>
  )
}
