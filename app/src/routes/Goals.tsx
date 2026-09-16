import { useState } from 'react'
import { Plus, Pencil, PiggyBank, Landmark } from 'lucide-react'
import { Eyebrow } from '@/components/chrome/Chrome'
import { Paper } from '@/components/chrome/Paper'
import { ProgressBar } from '@/components/chrome/ProgressBar'
import { useBankProducts, useGoals } from '@/hooks/use-finance-data'
import { formatMoney, formatDate } from '@/lib/format'
import { AddGoalDialog } from '@/components/goals/AddGoalDialog'
import { ContributeDialog } from '@/components/goals/ContributeDialog'
import type { Goal } from '@/types/domain'

/**
 * ВНИМАНИЕ: этот экран не подключён в App.tsx и отсутствует в макетах и
 * FUNCTIONAL.md — четыре таба это осознанное решение. Файл перекрашен под
 * дизайн, чтобы он не выглядел чужим, если цели всё-таки войдут в продукт
 * (скорее разделом внутри «Обзора», чем пятым табом). Иначе — удалить вместе
 * с AddGoalDialog / ContributeDialog / useGoals / useBankProducts.
 */
export function Goals() {
  const { data: goals, isLoading } = useGoals()
  const { data: bankProducts } = useBankProducts()

  const [addOpen, setAddOpen] = useState(false)
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null)
  const [contributingGoal, setContributingGoal] = useState<Goal | null>(null)

  if (isLoading) {
    return (
      <div className="space-y-3.5 pb-6">
        <div className="h-40 animate-pulse rounded-[18px] bg-hf-card" />
        <div className="h-40 animate-pulse rounded-[18px] bg-hf-card" />
      </div>
    )
  }

  return (
    <div className="space-y-3.5 pb-6">
      {goals?.map((goal) => {
        const progress = (goal.current_amount / goal.target_amount) * 100
        return (
          <div key={goal.id} className="flex flex-col gap-3.5">
            <Paper className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-2.5">
                <span className="text-[15px] font-medium">{goal.title}</span>
                {goal.target_date && (
                  <span className="shrink-0 font-mono text-[11px] text-hf-ink-soft">до {formatDate(goal.target_date)}</span>
                )}
              </div>
              <div className="text-[30px] font-bold tracking-[-0.03em]">{formatMoney(goal.current_amount, goal.currency)}</div>
              <ProgressBar pct={progress} onPaper />
              <div className="flex justify-between gap-2.5 text-[13px]">
                <span>Цель</span>
                <span className="font-mono text-hf-accent-ink">{formatMoney(goal.target_amount, goal.currency)}</span>
              </div>
            </Paper>

            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setContributingGoal(goal)}
                className="flex flex-1 items-center justify-center gap-2 rounded-[13px] bg-hf-accent py-3 text-[13px] font-medium text-white"
              >
                <PiggyBank className="h-3.5 w-3.5" />
                Пополнить
              </button>
              <button
                type="button"
                onClick={() => setEditingGoal(goal)}
                className="flex items-center justify-center gap-2 rounded-[13px] bg-hf-card px-4 py-3 text-[13px] text-hf-text-2"
              >
                <Pencil className="h-3.5 w-3.5" />
                Изменить
              </button>
            </div>

            {goal.ai_strategy ? (
              <div className="flex flex-col gap-3 rounded-[16px] bg-hf-card p-3.5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <p className="text-[11px] text-hf-text-4">Откладывать в месяц</p>
                    <p className="font-mono text-[15px] font-medium text-hf-text">
                      {formatMoney(goal.ai_strategy.monthly_contribution_needed, goal.currency)}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[11px] text-hf-text-4">Цель к</p>
                    <p className="text-[15px] font-medium text-hf-text">{formatDate(goal.ai_strategy.estimated_completion_date)}</p>
                  </div>
                </div>

                {goal.ai_strategy.bank_product_suggestions.length > 0 && (
                  <div className="space-y-2">
                    <Eyebrow>Варианты в РК</Eyebrow>
                    {goal.ai_strategy.bank_product_suggestions.map((s) => {
                      const product = bankProducts?.find((p) => p.id === s.bank_product_id)
                      if (!product) return null
                      return (
                        <div key={s.bank_product_id} className="flex items-start gap-2.5 rounded-[12px] bg-hf-bar p-3">
                          <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-hf-text-4" />
                          <div className="min-w-0 flex-1 space-y-1">
                            <p className="text-[13px] font-medium text-hf-text">
                              {product.bank_name} · {product.product_name}
                            </p>
                            <p className="text-[11px] leading-snug text-hf-text-4">
                              {product.rate_percent}% годовых · {s.reasoning}
                            </p>
                            <a
                              href={product.source_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-block text-[11px] text-hf-accent-on-dark underline underline-offset-2"
                            >
                              проверить на сайте банка (данные на {formatDate(product.updated_at)})
                            </a>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {goal.ai_strategy.risks.length > 0 && (
                  <ul className="space-y-1">
                    {goal.ai_strategy.risks.map((risk, i) => (
                      <li key={i} className="flex gap-2 text-[11px] leading-snug text-hf-text-4">
                        <span className="text-hf-warn-on-dark">·</span>
                        <span>{risk}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <p className="text-[13px] text-hf-text-4">AI-стратегия ещё не рассчитана для этой цели.</p>
            )}
          </div>
        )
      })}

      {(goals ?? []).length === 0 && (
        <div className="flex flex-col items-center gap-4 rounded-[20px] bg-hf-card px-5 py-8 text-center">
          <p className="text-[13px] leading-relaxed text-hf-text-3">Целей пока нет — добавь первую.</p>
        </div>
      )}

      <button
        type="button"
        onClick={() => setAddOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-hf-card py-3.5 text-sm text-hf-text-2"
      >
        <Plus className="h-4 w-4" />
        Новая цель
      </button>

      <AddGoalDialog open={addOpen} onOpenChange={setAddOpen} />
      <AddGoalDialog open={Boolean(editingGoal)} onOpenChange={(open) => !open && setEditingGoal(null)} goal={editingGoal ?? undefined} />
      <ContributeDialog open={Boolean(contributingGoal)} onOpenChange={(open) => !open && setContributingGoal(null)} goal={contributingGoal} />
    </div>
  )
}
