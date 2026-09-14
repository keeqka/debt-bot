import { useState } from 'react'
import { Plus, Pencil, PiggyBank, Landmark } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useBankProducts, useGoals } from '@/hooks/use-finance-data'
import { formatMoney, formatDate } from '@/lib/format'
import { AddGoalDialog } from '@/components/goals/AddGoalDialog'
import { ContributeDialog } from '@/components/goals/ContributeDialog'
import type { Goal } from '@/types/domain'

export function Goals() {
  const { data: goals, isLoading } = useGoals()
  const { data: bankProducts } = useBankProducts()

  const [addOpen, setAddOpen] = useState(false)
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null)
  const [contributingGoal, setContributingGoal] = useState<Goal | null>(null)

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="space-y-4 pb-6">
      <Button variant="outline" className="w-full rounded-2xl" onClick={() => setAddOpen(true)}>
        <Plus className="h-4 w-4" />
        Новая цель
      </Button>

      {goals?.map((goal) => {
        const progress = (goal.current_amount / goal.target_amount) * 100
        return (
          <Card key={goal.id}>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">{goal.title}</CardTitle>
                {goal.target_date && <Badge variant="secondary">до {formatDate(goal.target_date)}</Badge>}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Progress value={progress} />
                <div className="text-muted-foreground flex justify-between text-xs">
                  <span>{formatMoney(goal.current_amount, goal.currency)}</span>
                  <span>{formatMoney(goal.target_amount, goal.currency)}</span>
                </div>
              </div>

              <div className="flex gap-2">
                <Button size="sm" variant="secondary" className="flex-1" onClick={() => setContributingGoal(goal)}>
                  <PiggyBank className="h-3.5 w-3.5" />
                  Пополнить
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingGoal(goal)}>
                  <Pencil className="h-3.5 w-3.5" />
                  Изменить
                </Button>
              </div>

              {goal.ai_strategy ? (
                <div className="bg-muted/50 space-y-3 rounded-xl p-3">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-muted-foreground text-[11px]">Откладывать в месяц</p>
                      <p className="font-semibold">{formatMoney(goal.ai_strategy.monthly_contribution_needed, goal.currency)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-[11px]">Цель к</p>
                      <p className="font-semibold">{formatDate(goal.ai_strategy.estimated_completion_date)}</p>
                    </div>
                  </div>

                  {goal.ai_strategy.bank_product_suggestions.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold">Рекомендованные варианты в РК</p>
                      {goal.ai_strategy.bank_product_suggestions.map((s) => {
                        const product = bankProducts?.find((p) => p.id === s.bank_product_id)
                        if (!product) return null
                        return (
                          <div key={s.bank_product_id} className="flex items-start gap-2 rounded-lg border border-border bg-background p-2.5 text-xs">
                            <Landmark className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="font-medium">
                                {product.bank_name} · {product.product_name}
                              </p>
                              <p className="text-muted-foreground">{product.rate_percent}% годовых · {s.reasoning}</p>
                              <a href={product.source_url} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
                                проверить на сайте банка (данные на {formatDate(product.updated_at)})
                              </a>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {goal.ai_strategy.risks.length > 0 && (
                    <ul className="text-muted-foreground list-inside list-disc space-y-0.5 text-xs">
                      {goal.ai_strategy.risks.map((risk, i) => (
                        <li key={i}>{risk}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground text-xs">AI-стратегия ещё не рассчитана для этой цели.</p>
              )}
            </CardContent>
          </Card>
        )
      })}
      {(goals ?? []).length === 0 && <p className="text-muted-foreground py-8 text-center text-sm">Целей пока нет — добавьте первую</p>}

      <AddGoalDialog open={addOpen} onOpenChange={setAddOpen} />
      <AddGoalDialog open={Boolean(editingGoal)} onOpenChange={(open) => !open && setEditingGoal(null)} goal={editingGoal ?? undefined} />
      <ContributeDialog open={Boolean(contributingGoal)} onOpenChange={(open) => !open && setContributingGoal(null)} goal={contributingGoal} />
    </div>
  )
}
