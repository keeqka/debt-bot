import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, CircleDollarSign, HandCoins, Pencil, Trash2, Settings, Scale, Zap } from 'lucide-react'
import { ConfirmSheet } from '@/components/chrome/ConfirmSheet'
import { Eyebrow, Action, ActionBar } from '@/components/chrome/Chrome'
import { Paper } from '@/components/chrome/Paper'
import { ProgressBar } from '@/components/chrome/ProgressBar'
import { MascotAvatar } from '@/components/Mascot'
import { useDebts, useDeleteDebt, useMonth, useUpdateHouseholdSettings } from '@/hooks/use-finance-data'
import { orderDebts, type DebtStrategy } from '@/lib/budget'
import { replan } from '@/lib/month'
import { MODE_META, STRATEGY_META, modeSummary } from '@/lib/plan-text'
import { formatMoney, formatMoneyCompact, formatMonthYear } from '@/lib/format'
import { useAnimatedNumber } from '@/hooks/use-animated-number'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import type { Debt, ProposedDebt } from '@/types/domain'
import { cn } from '@/lib/utils'
import { AddDebtDialog } from '@/components/debts/AddDebtDialog'
import { RecordPaymentDialog } from '@/components/debts/RecordPaymentDialog'
import { DrawDebtDialog } from '@/components/debts/DrawDebtDialog'
import { cardAvailable } from '@/lib/credit-card'
import { EarlyPayoffSheet } from '@/components/debts/EarlyPayoffSheet'
import { StrategyCompareSheet } from '@/components/debts/StrategyCompareSheet'
import { NewDebtCheckSheet } from '@/components/debts/NewDebtCheckSheet'
import { readCheckFirst } from '@/lib/prefs'
import { features } from '@/lib/env'
import { DebtPayoffChart } from '@/components/charts/DebtPayoffChart'
import { GoalsSection } from '@/components/goals/GoalsSection'
import { BudgetSetupSheet } from '@/components/overview/BudgetSetupSheet'

const STRATEGIES: DebtStrategy[] = ['avalanche', 'snowball', 'cash_flow']

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

/**
 * «План»: всё, куда идут деньги сверх обычных трат, на одном экране — режим,
 * долги с датой свободы и стратегией, подушка и цели. Раньше цели жили внизу
 * «Обзора», а долги — отдельно, хотя это один план (lib/budget.ts).
 */
export function Plan() {
  const { data: debts, isLoading } = useDebts()
  const month = useMonth()
  const deleteDebt = useDeleteDebt()
  const updateSettings = useUpdateHouseholdSettings()

  const activeDebts = useMemo(() => debts?.filter((d) => d.status === 'active' && d.current_balance > 0) ?? [], [debts])
  // Погашенные карты: долга нет, но снимать с них можно — оставляем отдельным списком.
  const idleCards = useMemo(() => debts?.filter((d) => d.kind === 'credit_card' && !(d.status === 'active' && d.current_balance > 0)) ?? [], [debts])

  // Сколько сверх минимумов — из бюджета (lib/budget.ts); поле можно поправить
  // руками, чтобы посмотреть «что если». Всё считается локально той же
  // симуляцией, что и «Обзор», поэтому мгновенно и без ИИ.
  const [extraOverride, setExtraOverride] = useState<string | null>(null)
  const extra = extraOverride != null && Number.isFinite(Number(extraOverride)) ? Number(extraOverride) : (month?.planExtra ?? 0)
  const strategy = month?.settings.strategy ?? 'avalanche'

  const plans = useMemo(() => {
    if (!month || !debts) return null
    const byStrategy = Object.fromEntries(
      STRATEGIES.map((st) => [st, replan(month, debts, { monthlyExtra: extra, settings: { strategy: st } })]),
    ) as Record<DebtStrategy, ReturnType<typeof replan>>
    const minimumsOnly = replan(month, debts, { monthlyExtra: 0, rollover: false })
    return { byStrategy, minimumsOnly }
  }, [month, debts, extra])
  const plan = plans?.byStrategy[strategy]

  const aheadBy =
    plan?.debtFreeDate && plans?.minimumsOnly.debtFreeDate ? monthsBetween(plans.minimumsOnly.debtFreeDate, plan.debtFreeDate) : 0

  // The payoff date animates the same way as Overview's main number (§2/§3):
  // count the month offset from today rather than jump straight to the new
  // date, so editing the monthly extra visibly pulls the date with it.
  const reduced = useReducedMotion()
  const today = useMemo(() => new Date(), [])
  const monthsUntilPayoff = plan?.debtFreeDate ? monthsBetween(plan.debtFreeDate, today.toISOString().slice(0, 10)) : 0
  const animatedMonthsUntilPayoff = useAnimatedNumber(monthsUntilPayoff, 600, 1)
  const animatedPayoffDate = plan?.debtFreeDate ? addMonths(today, animatedMonthsUntilPayoff).toISOString() : null

  const ordered = plan ? orderDebts(activeDebts.map((d) => ({ ...d, balance: d.current_balance, rate: d.interest_rate, min: d.minimum_payment })), strategy) : activeDebts
  const closureOf = (id: string) => plan?.closures.find((c) => c.id === id)?.date ?? null
  const isCheap = (d: Debt) => month?.settings.mode === 'ladder' && (d.interest_rate ?? 0) < month.settings.highRateThreshold

  const [addOpen, setAddOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // «Цели →» с «Обзора» ведёт сюда с ?to=goals — сразу прокручиваем к ним.
  const [searchParams, setSearchParams] = useSearchParams()
  const goalsRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (searchParams.get('to') !== 'goals' || isLoading) return
    goalsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setSearchParams({}, { replace: true })
  }, [searchParams, setSearchParams, isLoading])
  const [editingDebt, setEditingDebt] = useState<Debt | null>(null)
  const [payingDebt, setPayingDebt] = useState<Debt | null>(null)
  const [drawingDebt, setDrawingDebt] = useState<Debt | null>(null)
  const [earlyDebt, setEarlyDebt] = useState<Debt | null>(null)
  const [compareOpen, setCompareOpen] = useState(false)
  const [checkOpen, setCheckOpen] = useState(false)
  const [addPrefill, setAddPrefill] = useState<ProposedDebt | undefined>(undefined)

  // «+ долг»: сначала проверка (07), если не выключена; иначе сразу форма.
  function startAddDebt() {
    if (features.preDebtCheck && readCheckFirst()) setCheckOpen(true)
    else {
      setAddPrefill(undefined)
      setAddOpen(true)
    }
  }
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
      {month && (
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="flex w-full items-center justify-between gap-3 rounded-[14px] bg-hf-card px-3.5 py-2.5 text-left"
        >
          <span className="min-w-0">
            <span className="block text-[11px] text-hf-text-4">Режим плана</span>
            <span className="block truncate text-[13px] text-hf-text">
              {MODE_META[month.settings.mode].label} · {STRATEGY_META[month.settings.strategy].label}
            </span>
          </span>
          <Settings className="h-4 w-4 shrink-0 text-hf-text-4" />
        </button>
      )}

      {activeDebts.length === 0 ? (
        <div className="flex items-center gap-3 rounded-[16px] bg-hf-card px-3.5 py-3">
          <MascotAvatar size={34} expression="calm" />
          <p className="min-w-0 flex-1 text-[13px] leading-snug text-hf-text-3">Долгов нет — свободные деньги идут в подушку и цели.</p>
          <button type="button" onClick={startAddDebt} className="shrink-0 text-[13px] font-medium text-hf-accent-on-dark">
            + долг
          </button>
        </div>
      ) : (
        <>
          <Paper className="flex flex-col gap-3.5">
            <div className="flex items-baseline justify-between gap-2.5">
              <Eyebrow>Свобода от долгов</Eyebrow>
              {aheadBy > 0 && <span className="font-mono text-[11px] text-hf-accent-ink">{'−'}{aheadBy} мес</span>}
            </div>
            {!plan ? (
              <div className="h-9 w-40 animate-pulse rounded bg-hf-receipt-line" />
            ) : (
              <div className="text-[30px] font-bold tracking-[-0.03em]">
                {plan.debtFreeDate ? formatMonthYear(animatedPayoffDate) : 'не закроются'}
              </div>
            )}
            <div className="h-px bg-hf-receipt-line" />
            <div className="flex justify-between gap-2.5 text-[13px]">
              <span>Осталось выплатить</span>
              <span className="font-mono">{formatMoney(activeDebts.reduce((s, d) => s + d.current_balance, 0))}</span>
            </div>
            <div className="flex justify-between gap-2.5 text-[13px]">
              <span>Сверх минимумов в месяц</span>
              <input
                type="number"
                value={extraOverride ?? extra}
                onChange={(e) => setExtraOverride(e.target.value)}
                className="w-28 rounded-md border border-hf-receipt-line bg-hf-receipt px-2 py-0.5 text-right font-mono text-[13px] text-hf-accent-ink"
              />
            </div>
            {plan && (
              <div className="flex justify-between gap-2.5 text-[13px]">
                <span>Переплата по процентам</span>
                <span className="font-mono">{formatMoney(plan.totalInterest)}</span>
              </div>
            )}
            {month && (
              <p className="text-[11px] leading-snug text-hf-ink-soft">
                {month.hasIncome
                  ? `Доход ${formatMoney(month.income)} − минимальные платежи ${formatMoney(month.minPayments)} − обычные траты ${formatMoney(month.typicalSpend)}${month.historyMonths === 0 ? ' (оценка по первому месяцу)' : ''}. ${modeSummary(month.settings)}${plan ? `: в этом месяце ${formatMoney(plan.now.toDebts)} в долги` : ''}${plan && plan.now.toCushion > 0 ? `, ${formatMoney(plan.now.toCushion)} в подушку` : ''}.`
                  : 'Укажи доход в настройках на «Обзоре» — тогда посчитаю, сколько можно вносить сверх минимумов.'}
              </p>
            )}
          </Paper>

          <div className="space-y-2">
            {features.strategyCompare && (
              <button
                type="button"
                onClick={() => setCompareOpen(true)}
                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-[14px] bg-hf-card px-3.5 py-2.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hf-accent"
              >
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-hf-text">Пересчитать план</span>
                  <span className="block text-[11px] text-hf-text-4">Лавина или снежный ком — бок о бок</span>
                </span>
                <Scale className="h-4 w-4 shrink-0 text-hf-text-4" />
              </button>
            )}
            <div className="flex rounded-[13px] bg-hf-card p-1">
              {STRATEGIES.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => kind !== strategy && updateSettings.mutate({ debt_strategy: kind })}
                  className={cn(
                    'flex-1 rounded-[10px] py-2 text-[13px] font-medium transition-colors',
                    strategy === kind ? 'bg-hf-accent text-white' : 'text-hf-text-4',
                  )}
                >
                  {STRATEGY_META[kind].label}
                </button>
              ))}
            </div>
            <p className="text-[12px] leading-relaxed text-hf-text-3">{STRATEGY_META[strategy].why}</p>
            {plans && (
              // Честное сравнение: те же деньги, тот же режим — меняется только порядок.
              <div className="space-y-1 rounded-[14px] bg-hf-card px-3.5 py-2.5">
                {STRATEGIES.map((kind) => {
                  const p = plans.byStrategy[kind]
                  return (
                    <div key={kind} className={cn('flex justify-between gap-2 text-[12px]', kind === strategy ? 'text-hf-text' : 'text-hf-text-4')}>
                      <span>{STRATEGY_META[kind].label}</span>
                      <span className="font-mono">
                        {p.debtFreeDate ? formatMonthYear(p.debtFreeDate) : '—'} · переплата {formatMoneyCompact(p.totalInterest)}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2.5">
            <Eyebrow>Порядок выплат</Eyebrow>
            <AnimatePresence initial={false}>
            {ordered.map((d, i) => {
              const debt = activeDebts.find((x) => x.id === d.id)
              if (!debt) return null
              const progress = ((debt.principal_amount - debt.current_balance) / debt.principal_amount) * 100
              const isCard = debt.kind === 'credit_card'
              const manage = (
                <>
                  <button
                    type="button"
                    onClick={() => setEditingDebt(debt)}
                    aria-label={`Редактировать ${debt.title}`}
                    className="flex min-h-11 min-w-11 items-center justify-center rounded-[10px] bg-hf-bar px-3 py-2 text-xs text-hf-text-2"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeletingDebt(debt)}
                    aria-label={`Удалить ${debt.title}`}
                    className="flex min-h-11 min-w-11 items-center justify-center rounded-[10px] bg-hf-bar px-3 py-2 text-xs text-hf-warn-on-dark"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )
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
                  <p className="text-xs text-hf-text-4">
                    {isCheap(debt) ? 'Дешёвый долг — после полной подушки' : i === 0 ? STRATEGY_META[strategy].first : 'Минимальный платёж, пока не дойдёт очередь'}
                    {closureOf(debt.id) ? ` · закроется: ${formatMonthYear(closureOf(debt.id))}` : ''}
                  </p>
                  <div className={cn('gap-2 pt-1', debt.kind === 'credit_card' ? 'grid grid-cols-3' : 'flex flex-wrap')}>
                    <button
                      type="button"
                      onClick={() => setPayingDebt(debt)}
                      className="flex min-h-11 min-w-[84px] flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-hf-bar py-2 text-xs text-hf-text-2"
                    >
                      <CircleDollarSign className="h-3.5 w-3.5" />
                      Платёж
                    </button>
                    {debt.kind === 'credit_card' && (
                      <button
                        type="button"
                        onClick={() => setDrawingDebt(debt)}
                        className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-hf-bar py-2 text-xs text-hf-text-2"
                      >
                        <HandCoins className="h-3.5 w-3.5" />
                        Снять
                      </button>
                    )}
                    {features.debtSim && (
                      <button
                        type="button"
                        onClick={() => setEarlyDebt(debt)}
                        className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-hf-bar py-2 text-xs text-hf-accent-on-dark"
                      >
                        <Zap className="h-3.5 w-3.5" />
                        Досрочно
                      </button>
                    )}
                    {!isCard && manage}
                  </div>
                  {isCard && (
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 font-mono text-[11px] text-hf-text-4">
                        {debt.credit_limit != null ? `Лимит ${formatMoney(debt.credit_limit)} · доступно ${formatMoney(cardAvailable(debt) ?? 0)}` : 'Лимит не указан'}
                      </p>
                      <div className="flex shrink-0 gap-2">{manage}</div>
                    </div>
                  )}
                </motion.div>
              )
            })}
            </AnimatePresence>
          </div>

          {plans && <DebtPayoffChart timelines={plans.byStrategy} selected={strategy} />}

          <ActionBar>
            <Action variant="muted" onClick={startAddDebt}>
              <Plus className="mr-1.5 inline h-4 w-4 align-[-3px]" />
              Новый долг
            </Action>
          </ActionBar>
        </>
      )}

      {idleCards.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <Eyebrow>Кредитки без долга</Eyebrow>
          {idleCards.map((card) => (
            <div key={card.id} className="flex items-center gap-2.5 rounded-[16px] bg-hf-card p-3.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-hf-text">{card.title}</p>
                <p className="font-mono text-[11px] text-hf-text-4">
                  {card.credit_limit != null ? `доступно ${formatMoney(cardAvailable(card) ?? 0)}` : 'лимит не указан'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDrawingDebt(card)}
                className="flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] bg-hf-bar px-3.5 text-xs text-hf-text-2"
              >
                <HandCoins className="h-3.5 w-3.5" />
                Снять
              </button>
              <button
                type="button"
                onClick={() => setEditingDebt(card)}
                aria-label={`Редактировать ${card.title}`}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-[10px] bg-hf-bar text-hf-text-2"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div ref={goalsRef} className="scroll-mt-4 pt-2">
        <GoalsSection />
      </div>

      <BudgetSetupSheet open={settingsOpen} onOpenChange={setSettingsOpen} />

      <NewDebtCheckSheet
        open={checkOpen}
        onOpenChange={setCheckOpen}
        onProceed={(prefill) => {
          setAddPrefill(prefill ?? undefined)
          setAddOpen(true)
        }}
      />
      <AddDebtDialog open={addOpen} onOpenChange={setAddOpen} prefill={addPrefill} />
      <AddDebtDialog open={Boolean(editingDebt)} onOpenChange={(open) => !open && setEditingDebt(null)} debt={editingDebt ?? undefined} />
      <RecordPaymentDialog open={Boolean(payingDebt)} onOpenChange={(open) => !open && setPayingDebt(null)} debt={payingDebt} />
      <DrawDebtDialog open={Boolean(drawingDebt)} onOpenChange={(open) => !open && setDrawingDebt(null)} debt={drawingDebt} />
      <StrategyCompareSheet open={compareOpen} onOpenChange={setCompareOpen} />
      <EarlyPayoffSheet open={Boolean(earlyDebt)} onOpenChange={(open) => !open && setEarlyDebt(null)} debt={earlyDebt} />

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
