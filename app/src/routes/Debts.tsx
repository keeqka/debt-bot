import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, CircleDollarSign, Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useDebts, useDebtStrategy, useDeleteDebt, useExpenses, useIncomes } from '@/hooks/use-finance-data'
import { formatMoney, formatDate } from '@/lib/format'
import type { Debt, DebtStrategyKind } from '@/types/domain'
import { cn } from '@/lib/utils'
import { AddDebtDialog } from '@/components/debts/AddDebtDialog'
import { RecordPaymentDialog } from '@/components/debts/RecordPaymentDialog'
import { DebtPayoffChart } from '@/components/charts/DebtPayoffChart'

function isThisMonth(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
}

export function Debts() {
  const { data: debts, isLoading } = useDebts()
  const { data: incomes } = useIncomes()
  const { data: expenses } = useExpenses()

  const activeDebts = debts?.filter((d) => d.status === 'active') ?? []
  const totalMinPayments = activeDebts.reduce((sum, d) => sum + d.minimum_payment, 0)
  const monthIncome = (incomes ?? []).filter((i) => isThisMonth(i.received_at)).reduce((s, i) => s + i.amount, 0)
  const monthExpense = (expenses ?? []).filter((e) => isThisMonth(e.spent_at)).reduce((s, e) => s + e.amount, 0)

  const computedSurplus = Math.max(0, monthIncome - monthExpense - totalMinPayments)

  // The surplus input feeds directly into the AI query key (getDebtStrategy
  // calls Claude), so committing every keystroke would fire a fresh AI call
  // per character typed. surplusText is what the field shows live; surplus
  // (used for the actual query) only catches up 600ms after typing stops.
  const [surplusText, setSurplusText] = useState<string | null>(null)
  const [surplusOverride, setSurplusOverride] = useState<number | null>(null)
  const surplus = surplusOverride ?? computedSurplus

  useEffect(() => {
    if (surplusText === null) return
    const id = setTimeout(() => {
      const n = Number(surplusText)
      if (Number.isFinite(n)) setSurplusOverride(n)
    }, 600)
    return () => clearTimeout(id)
  }, [surplusText])

  const [strategy, setStrategy] = useState<DebtStrategyKind>('optimal')
  const { data: plan, isLoading: planLoading } = useDebtStrategy(strategy, surplus)

  const [addOpen, setAddOpen] = useState(false)
  const [editingDebt, setEditingDebt] = useState<Debt | null>(null)
  const [payingDebt, setPayingDebt] = useState<Debt | null>(null)
  const [deletingDebt, setDeletingDebt] = useState<Debt | null>(null)
  const deleteDebt = useDeleteDebt()

  async function confirmDelete() {
    if (!deletingDebt) return
    await deleteDebt.mutateAsync(deletingDebt.id)
    toast.success('Долг удалён')
    setDeletingDebt(null)
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-28 w-full rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="space-y-5 pb-6">
      <Button variant="outline" className="w-full rounded-2xl" onClick={() => setAddOpen(true)}>
        <Plus className="h-4 w-4" />
        Новый долг
      </Button>

      <div className="space-y-3">
        {(debts ?? []).map((debt) => {
          const progress = ((debt.principal_amount - debt.current_balance) / debt.principal_amount) * 100
          const isClosed = debt.status === 'closed'
          return (
            <Card key={debt.id} className={cn(isClosed && 'opacity-60')}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{debt.title}</p>
                    <p className="text-muted-foreground text-xs">{debt.creditor}</p>
                  </div>
                  {isClosed ? <Badge variant="outline">Закрыт</Badge> : <Badge variant="secondary">{debt.interest_rate ?? 0}% годовых</Badge>}
                </div>
                <Progress value={progress} />
                <div className="text-muted-foreground flex items-center justify-between text-xs">
                  <span>Остаток: {formatMoney(debt.current_balance, debt.currency)}</span>
                  <span>
                    Мин. платёж {formatMoney(debt.minimum_payment, debt.currency)}
                    {debt.due_day ? ` · ${debt.due_day} числа` : ''}
                  </span>
                </div>
                <div className="flex gap-2 pt-1">
                  {!isClosed && (
                    <Button size="sm" variant="secondary" className="flex-1" onClick={() => setPayingDebt(debt)}>
                      <CircleDollarSign className="h-3.5 w-3.5" />
                      Платёж
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className={cn(!isClosed && 'flex-none')} onClick={() => setEditingDebt(debt)}>
                    <Pencil className="h-3.5 w-3.5" />
                    Изменить
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground hover:text-destructive flex-none"
                    onClick={() => setDeletingDebt(debt)}
                    aria-label={`Удалить ${debt.title}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
        {(debts ?? []).length === 0 && <p className="text-muted-foreground py-8 text-center text-sm">Долгов пока нет — добавьте первый</p>}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">AI-стратегия погашения</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 items-end gap-3">
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs">Свободный остаток/мес.</Label>
              <Input
                type="number"
                value={surplusText ?? surplus}
                onChange={(e) => setSurplusText(e.target.value)}
                className="h-9"
              />
            </div>
            <p className="text-muted-foreground pb-2 text-[11px]">
              Доход − расходы − мин. платежи. Можно скорректировать вручную.
            </p>
          </div>

          <Tabs value={strategy} onValueChange={(v) => setStrategy(v as DebtStrategyKind)}>
            <TabsList className="w-full">
              <TabsTrigger value="optimal">Оптимальная</TabsTrigger>
              <TabsTrigger value="aggressive">Агрессивная</TabsTrigger>
            </TabsList>
            {(['optimal', 'aggressive'] as const).map((kind) => (
              <TabsContent key={kind} value={kind} className="space-y-3 pt-3">
                {activeDebts.length === 0 ? (
                  <p className="text-muted-foreground py-4 text-center text-xs">Нет активных долгов для расчёта</p>
                ) : planLoading || !plan || plan.strategy !== kind ? (
                  <Skeleton className="h-32 w-full" />
                ) : (
                  <StrategyResult plan={plan} debts={activeDebts} />
                )}
              </TabsContent>
            ))}
          </Tabs>

          {activeDebts.length > 0 && (
            <div className="border-border border-t pt-4">
              <DebtPayoffChart debts={activeDebts} monthlySurplus={surplus} />
            </div>
          )}
        </CardContent>
      </Card>

      <AddDebtDialog open={addOpen} onOpenChange={setAddOpen} />
      <AddDebtDialog open={Boolean(editingDebt)} onOpenChange={(open) => !open && setEditingDebt(null)} debt={editingDebt ?? undefined} />
      <RecordPaymentDialog open={Boolean(payingDebt)} onOpenChange={(open) => !open && setPayingDebt(null)} debt={payingDebt} />

      <AlertDialog open={Boolean(deletingDebt)} onOpenChange={(open) => !open && setDeletingDebt(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить «{deletingDebt?.title}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Долг и вся история платежей по нему удалятся безвозвратно. Если он просто погашен — лучше отредактировать и поставить статус «Закрыт».
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={deleteDebt.isPending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteDebt.isPending ? 'Удаление...' : 'Удалить'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function StrategyResult({
  plan,
  debts,
}: {
  plan: NonNullable<ReturnType<typeof useDebtStrategy>['data']>
  debts: ReturnType<typeof useDebts>['data']
}) {
  const orderedDebts = useMemo(
    () => plan.payoff_order.map((id) => debts?.find((d) => d.id === id)).filter(Boolean),
    [plan, debts],
  )

  return (
    <div className="space-y-3">
      <div
        className={cn(
          'rounded-xl border p-3',
          plan.strategy === 'optimal' ? 'border-status-light-green/40 bg-status-light-green/10' : 'border-status-orange/40 bg-status-orange/10',
        )}
      >
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <p className="text-muted-foreground text-[11px]">Погашение к</p>
            <p className="font-semibold">{formatDate(plan.estimated_payoff_date)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-[11px]">Переплата по %</p>
            <p className="font-semibold">{formatMoney(plan.total_interest_paid)}</p>
          </div>
        </div>
      </div>
      <p className="text-muted-foreground text-xs leading-relaxed">{plan.explanation}</p>
      <div className="space-y-1.5">
        <p className="text-xs font-semibold">Порядок погашения</p>
        {orderedDebts.map((debt, i) => (
          <div key={debt!.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-xs">
            <span className="flex items-center gap-2">
              <span className="bg-primary/10 text-primary flex h-5 w-5 items-center justify-center rounded-full font-semibold">
                {i + 1}
              </span>
              {debt!.title}
            </span>
            <span className="text-muted-foreground">{debt!.interest_rate}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
