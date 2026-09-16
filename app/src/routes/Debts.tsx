import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, CircleDollarSign, Pencil, Trash2 } from 'lucide-react'
import { ConfirmSheet } from '@/components/chrome/ConfirmSheet'
import { Eyebrow, Action, ActionBar } from '@/components/chrome/Chrome'
import { Paper } from '@/components/chrome/Paper'
import { ProgressBar } from '@/components/chrome/ProgressBar'
import { MascotAvatar } from '@/components/Mascot'
import { useDebts, useDebtStrategy, useDeleteDebt, useExpenses, useIncomes } from '@/hooks/use-finance-data'
import { debtPayoffNote, simulateDebtStrategy } from '@/lib/debt-strategy'
import { formatMoney, formatMonthYear } from '@/lib/format'
import { useAnimatedNumber } from '@/hooks/use-animated-number'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
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

/** Months between two ISO dates, whole months only (day-of-month ignored — good enough for an "ahead by" headline). */
function monthsBetween(fromIso: string, toIso: string) {
  const a = new Date(fromIso)
  const b = new Date(toIso)
  return (a.getFullYear() - b.getFullYear()) * 12 + (a.getMonth() - b.getMonth())
}

function addMonths(date: Date, months: number) {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

export function Debts() {
  const { data: debts, isLoading } = useDebts()
  const { data: incomes } = useIncomes()
  const { data: expenses } = useExpenses()
  const deleteDebt = useDeleteDebt()

  const activeDebts = useMemo(() => debts?.filter((d) => d.status === 'active') ?? [], [debts])
  const totalMinPayments = activeDebts.reduce((sum, d) => sum + d.minimum_payment, 0)
  const monthIncome = (incomes ?? []).filter((i) => isThisMonth(i.received_at)).reduce((s, i) => s + i.amount, 0)
  const monthExpense = (expenses ?? []).filter((e) => isThisMonth(e.spent_at)).reduce((s, e) => s + e.amount, 0)
  const computedSurplus = Math.max(0, monthIncome - monthExpense - totalMinPayments)

  // The surplus input feeds the AI query key (getDebtStrategy calls Claude),
  // so committing every keystroke would fire a fresh AI call per character
  // typed. surplusText is what the field shows live; surplus (the actual
  // query input) only catches up 600ms after typing stops.
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

  const [algorithm, setAlgorithm] = useState<DebtStrategyKind>('avalanche')
  const { data: plan, isLoading: planLoading } = useDebtStrategy(algorithm, surplus)

  // "На сколько раньше, чем при минимальных платежах" — same regardless of
  // algorithm (with zero extra budget, order never matters), so one baseline.
  const baselineDate = useMemo(
    () => (activeDebts.length ? simulateDebtStrategy({ debts: activeDebts, monthlySurplus: 0, strategy: 'avalanche' }).estimated_payoff_date : null),
    [activeDebts],
  )
  const aheadBy = plan?.estimated_payoff_date && baselineDate ? monthsBetween(baselineDate, plan.estimated_payoff_date) : 0

  // The payoff date animates the same way as Overview's main number (§2/§3):
  // count the month offset from today rather than jump straight to the new
  // date, so dragging "Свободно в месяц" visibly pulls the date with it
  // instead of it just flickering to a new string.
  const reduced = useReducedMotion()
  const today = useMemo(() => new Date(), [])
  const monthsUntilPayoff = plan?.estimated_payoff_date ? monthsBetween(plan.estimated_payoff_date, today.toISOString().slice(0, 10)) : 0
  const animatedMonthsUntilPayoff = useAnimatedNumber(monthsUntilPayoff, 600, 1)
  const animatedPayoffDate = plan?.estimated_payoff_date ? addMonths(today, animatedMonthsUntilPayoff).toISOString() : null

  const [addOpen, setAddOpen] = useState(false)
  const [editingDebt, setEditingDebt] = useState<Debt | null>(null)
  const [payingDebt, setPayingDebt] = useState<Debt | null>(null)
  const [deletingDebt, setDeletingDebt] = useState<Debt | null>(null)

  async function confirmDelete() {
    if (!deletingDebt) return
    await deleteDebt.mutateAsync(deletingDebt.id)
    toast.success('Долг удалён')
    setDeletingDebt(null)
  }

  if (isLoading) {
    return (
      <div className="space-y-3.5 pb-6">
        <div className="h-32 animate-pulse rounded-2xl bg-hf-card" />
        <div className="h-24 animate-pulse rounded-2xl bg-hf-card" />
      </div>
    )
  }

  return (
    <div className="space-y-3.5 pb-6">
      {activeDebts.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-[20px] bg-hf-card px-5 py-8 text-center">
          <MascotAvatar size={56} expression="calm" />
          <p className="text-[13px] leading-relaxed text-hf-text-3">Долгов пока нет — если есть кредитка или рассрочка, добавь первую.</p>
          <button type="button" onClick={() => setAddOpen(true)} className="rounded-[14px] bg-hf-accent px-6 py-3 text-sm font-medium text-white">
            Новый долг
          </button>
        </div>
      ) : (
        <>
          <Paper className="flex flex-col gap-3.5">
            <div className="flex items-baseline justify-between gap-2.5">
              <Eyebrow>Свобода от долгов</Eyebrow>
              {aheadBy > 0 && <span className="font-mono text-[11px] text-hf-accent-ink">{'−'}{aheadBy} мес</span>}
            </div>
            {planLoading || !plan ? (
              <div className="h-9 w-40 animate-pulse rounded bg-hf-receipt-line" />
            ) : (
              <div className="text-[30px] font-bold tracking-[-0.03em]">{formatMonthYear(animatedPayoffDate)}</div>
            )}
            <div className="h-px bg-hf-receipt-line" />
            <div className="flex justify-between gap-2.5 text-[13px]">
              <span>Осталось выплатить</span>
              <span className="font-mono">{formatMoney(activeDebts.reduce((s, d) => s + d.current_balance, 0))}</span>
            </div>
            <div className="flex justify-between gap-2.5 text-[13px]">
              <span>Свободно в месяц</span>
              <input
                type="number"
                value={surplusText ?? surplus}
                onChange={(e) => setSurplusText(e.target.value)}
                className="w-28 rounded-md border border-hf-receipt-line bg-hf-receipt px-2 py-0.5 text-right font-mono text-[13px] text-hf-accent-ink"
              />
            </div>
          </Paper>

          <div className="flex rounded-[13px] bg-hf-card p-1">
            {(['avalanche', 'snowball'] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => setAlgorithm(kind)}
                className={cn(
                  'flex-1 rounded-[10px] py-2 text-[13px] font-medium transition-colors',
                  algorithm === kind ? 'bg-hf-accent text-white' : 'text-hf-text-4',
                )}
              >
                {kind === 'avalanche' ? 'Лавина' : 'Снежный ком'}
              </button>
            ))}
          </div>

          {plan && !planLoading && <p className="text-[12px] leading-relaxed text-hf-text-3">{plan.explanation}</p>}

          <div className="flex flex-col gap-2.5">
            <Eyebrow>Порядок выплат</Eyebrow>
            <AnimatePresence initial={false}>
            {(plan?.payoff_order ?? activeDebts.map((d) => d.id)).map((id, i) => {
              const debt = activeDebts.find((d) => d.id === id)
              if (!debt) return null
              const progress = ((debt.principal_amount - debt.current_balance) / debt.principal_amount) * 100
              return (
                <motion.div
                  key={debt.id}
                  layout
                  exit={{ opacity: 0, scale: 0.96, transition: { duration: reduced ? 0 : 0.25 } }}
                  transition={{ layout: { duration: reduced ? 0 : 0.3, ease: 'easeInOut' } }}
                  className="flex flex-col gap-2.5 rounded-[16px] bg-hf-card p-3.5">
                  <div className="flex items-center justify-between gap-2.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className={cn('font-mono text-[11px]', i === 0 ? 'text-hf-accent-on-dark' : 'text-hf-text-4')}>{i + 1}</span>
                      <span className="truncate text-sm text-hf-text">{debt.title}</span>
                      <span className="font-mono text-[11px] text-hf-text-4">{debt.interest_rate ?? 0}%</span>
                    </div>
                    <span className="font-mono text-xs text-hf-text-4">{formatMoney(debt.current_balance)}</span>
                  </div>
                  <ProgressBar pct={progress} tone={i === 0 ? 'accent' : i === 1 ? 'soft' : 'faint'} />
                  <p className="text-xs text-hf-text-4">{debtPayoffNote(i, algorithm)}</p>
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setPayingDebt(debt)}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-hf-bar py-2 text-xs text-hf-text-2"
                    >
                      <CircleDollarSign className="h-3.5 w-3.5" />
                      Платёж
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingDebt(debt)}
                      className="flex items-center justify-center gap-1.5 rounded-[10px] bg-hf-bar px-3 py-2 text-xs text-hf-text-2"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingDebt(debt)}
                      aria-label={`Удалить ${debt.title}`}
                      className="flex items-center justify-center gap-1.5 rounded-[10px] bg-hf-bar px-3 py-2 text-xs text-hf-warn-on-dark"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </motion.div>
              )
            })}
            </AnimatePresence>
          </div>

          <DebtPayoffChart debts={activeDebts} monthlySurplus={surplus} />

          <ActionBar>
            <Action variant="muted" onClick={() => setAddOpen(true)}>
              <Plus className="mr-1.5 inline h-4 w-4 align-[-3px]" />
              Новый долг
            </Action>
          </ActionBar>
        </>
      )}

      <AddDebtDialog open={addOpen} onOpenChange={setAddOpen} />
      <AddDebtDialog open={Boolean(editingDebt)} onOpenChange={(open) => !open && setEditingDebt(null)} debt={editingDebt ?? undefined} />
      <RecordPaymentDialog open={Boolean(payingDebt)} onOpenChange={(open) => !open && setPayingDebt(null)} debt={payingDebt} />

      <ConfirmSheet
        open={Boolean(deletingDebt)}
        onOpenChange={(open) => !open && setDeletingDebt(null)}
        title={`Удалить «${deletingDebt?.title}»?`}
        description="Долг и вся история платежей по нему удалятся безвозвратно. Если он просто погашен — лучше отредактировать и поставить статус «Закрыт»."
        confirmLabel="Удалить"
        pending={deleteDebt.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  )
}
