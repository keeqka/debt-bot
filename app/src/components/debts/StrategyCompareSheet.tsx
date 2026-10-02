import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { FormSheet } from '@/components/chrome/FormSheet'
import { MascotAvatar } from '@/components/Mascot'
import { useDebts, useMonth, useUpdateHouseholdSettings } from '@/hooks/use-finance-data'
import { compareStrategies, strategyVerdict, type StrategyOutcome } from '@/lib/debt-sim'
import { simInputOf } from '@/lib/month'
import { STRATEGY_META } from '@/lib/plan-text'
import { formatMoney, formatMoneyCompact, formatMonthYear } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { DebtStrategy } from '@/lib/budget'

/**
 * «Пересчитать план» (06): лавина и снежный ком бок о бок на одной сумме
 * платежа. Выбранная стратегия — на бумаге, вторая — на тёмной карточке. Поток
 * (cash flow) появляется третьей карточкой, только когда долгов три и больше:
 * на двух долгах он повторяет одну из двух.
 */
export function StrategyCompareSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const month = useMonth()
  const { data: debts } = useDebts()
  const update = useUpdateHouseholdSettings()
  const saved: DebtStrategy = month?.settings.strategy ?? 'avalanche'
  const [picked, setPicked] = useState<DebtStrategy>(saved)

  useEffect(() => {
    if (open) setPicked(saved)
  }, [open, saved])

  const activeCount = (debts ?? []).filter((d) => d.status === 'active' && d.current_balance > 0).length
  const strategies: DebtStrategy[] = activeCount >= 3 ? ['avalanche', 'snowball', 'cash_flow'] : ['avalanche', 'snowball']

  const outcomes = useMemo(
    () => (month && debts ? compareStrategies(simInputOf(month, debts), strategies) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [month, debts, activeCount],
  )
  const [avalanche, snowball] = outcomes ?? []
  const verdict = avalanche && snowball ? strategyVerdict(avalanche, snowball) : null

  async function save() {
    if (picked === saved) return onOpenChange(false)
    await update.mutateAsync({ debt_strategy: picked })
    toast.success(`Стратегия: ${STRATEGY_META[picked].label}`)
    onOpenChange(false)
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Лавина или снежный ком"
      footer={
        <button
          type="button"
          onClick={save}
          disabled={update.isPending}
          className="w-full rounded-[13px] bg-hf-accent py-3.5 text-[15px] font-medium text-white disabled:opacity-50"
        >
          {update.isPending ? 'Сохраняю…' : picked === saved ? 'Оставить как есть' : `Выбрать: ${STRATEGY_META[picked].label}`}
        </button>
      }
    >
      <p className="text-[12px] leading-relaxed text-hf-text-3">
        Одна и та же сумма: {month ? `${formatMoney(month.planExtra)} сверх минимумов в месяц` : '…'}. Меняется только порядок — кого гасить первым.
      </p>

      {!outcomes ? (
        <div className="h-36 animate-pulse rounded-[18px] bg-hf-card" />
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          {outcomes.map((o, i) => (
            <StrategyCard
              key={o.strategy}
              outcome={o}
              selected={picked === o.strategy}
              current={saved === o.strategy}
              wide={strategies.length === 3 && i === 2}
              onPick={() => setPicked(o.strategy)}
            />
          ))}
        </div>
      )}

      {verdict && avalanche && snowball && (
        <div className="flex items-start gap-3 rounded-[16px] bg-hf-card p-3.5">
          <MascotAvatar size={34} expression={verdict.minimal ? 'calm' : 'focused'} />
          <div className="min-w-0 space-y-1.5 text-[13px] leading-snug text-hf-text-2">
            {verdict.minimal ? (
              <p>Разница минимальная — выбирай по ощущениям.</p>
            ) : (
              <>
                {verdict.cheaper && (
                  <p>
                    {STRATEGY_META[verdict.cheaper.strategy].label}: переплата меньше на {formatMoney(verdict.cheaper.by)}.
                  </p>
                )}
                {verdict.fasterFirst && (
                  <p>
                    {STRATEGY_META[verdict.fasterFirst.strategy].label}: первый долг закроется на {verdict.fasterFirst.by} мес раньше — приятно видеть
                    результат.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </FormSheet>
  )
}

function StrategyCard({
  outcome,
  selected,
  current,
  wide,
  onPick,
}: {
  outcome: StrategyOutcome
  selected: boolean
  current: boolean
  wide: boolean
  onPick: () => void
}) {
  const meta = STRATEGY_META[outcome.strategy]
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onPick}
      className={cn(
        'flex min-h-11 flex-col gap-2.5 rounded-[18px] p-3.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hf-accent',
        wide && 'col-span-2',
        selected ? 'bg-hf-receipt text-hf-ink' : 'bg-hf-card text-hf-text',
      )}
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className={cn('font-mono text-[11px] tracking-[0.1em] uppercase', selected ? 'text-hf-ink-soft' : 'text-hf-text-4')}>{meta.label}</span>
        {current && <span className={cn('font-mono text-[10px]', selected ? 'text-hf-accent-ink' : 'text-hf-accent-on-dark')}>сейчас</span>}
      </span>
      <span className="text-[19px] leading-tight font-bold tracking-[-0.02em]">
        {outcome.debtFreeDate ? formatMonthYear(outcome.debtFreeDate) : 'не закроются'}
      </span>
      <span className="flex flex-col gap-1 text-[12px]">
        <span className="flex justify-between gap-2">
          <span className={selected ? 'text-hf-ink-soft' : 'text-hf-text-4'}>Переплата</span>
          <span className="font-mono">{formatMoneyCompact(outcome.totalInterest)}</span>
        </span>
        <span className="flex justify-between gap-2">
          <span className={selected ? 'text-hf-ink-soft' : 'text-hf-text-4'}>Первый закрыт</span>
          <span className="font-mono">{outcome.firstClosedMonths != null ? `${outcome.firstClosedMonths} мес` : '—'}</span>
        </span>
      </span>
    </button>
  )
}
