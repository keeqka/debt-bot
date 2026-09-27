import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAddGoal, useGoals, useHouseholdSettings, useMonth, useUpdateGoal, useUpdateHouseholdSettings } from '@/hooks/use-finance-data'
import { MODE_META, STRATEGY_META } from '@/lib/plan-text'
import { formatMoney, formatMonthYear } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { DebtStrategyKind, HouseholdSettings, PriorityMode } from '@/types/domain'

const MODES: PriorityMode[] = ['debts_first', 'cushion_first', 'split', 'ladder']
const STRATEGIES: DebtStrategyKind[] = ['avalanche', 'snowball', 'cash_flow']

const numberClass =
  'h-9 w-20 rounded-[10px] border border-hf-line bg-hf-bar px-2.5 text-right font-mono text-[13px] text-hf-text focus:border-hf-accent focus:outline-none'

/**
 * «Модель бота»: куда идут деньги сверх обычных трат и в каком порядке
 * гасятся долги. Всё сохраняется сразу и для всей семьи (household_settings, строка семьи);
 * «Обзор», «План» и «Чек» в чате пересчитываются от этих полей.
 */
export function PlanSettingsSection() {
  const { data: settings } = useHouseholdSettings()
  const update = useUpdateHouseholdSettings()
  const month = useMonth()
  const { data: goals } = useGoals()
  const addGoal = useAddGoal()
  const updateGoal = useUpdateGoal()

  const cushionGoal = (goals ?? []).find((g) => g.is_cushion && g.status === 'active')

  // Числа правятся в поле и сохраняются по уходу из него, а не на каждую цифру.
  const [draft, setDraft] = useState({ cushion: '', split: '', rate: '' })
  useEffect(() => {
    if (!settings) return
    setDraft({ cushion: String(settings.cushion_months), split: String(settings.split_debt_pct), rate: String(settings.high_rate_threshold) })
  }, [settings])

  if (!settings) return null

  function save(patch: Partial<HouseholdSettings>) {
    update.mutate(patch)
  }

  function saveNumber(key: 'cushion_months' | 'split_debt_pct' | 'high_rate_threshold', raw: string, min: number, max: number) {
    const n = Number(raw)
    if (!raw.trim() || !Number.isFinite(n)) return
    const value = Math.min(max, Math.max(min, n))
    if (value === settings![key]) return
    save({ [key]: value })
    // Цель-подушка живёт в тех же единицах — держим её сумму в синхроне с размером резерва.
    if (key === 'cushion_months' && cushionGoal && month) {
      updateGoal.mutate({ id: cushionGoal.id, patch: { target_amount: Math.round(value * month.monthlyNeed) } })
    }
  }

  async function createCushion() {
    if (!month) return
    await addGoal.mutateAsync({
      title: 'Подушка безопасности',
      target_amount: month.plan.cushionTarget,
      current_amount: 0,
      target_date: null,
      currency: 'KZT',
      status: 'active',
      is_cushion: true,
    })
    toast.success('Подушка заведена — пополняй её как обычную цель')
  }

  return (
    <div className="space-y-4 border-t border-hf-line pt-4">
      <div className="space-y-1">
        <p className="text-[13px] font-medium text-hf-text">Как распределять деньги</p>
        <p className="text-[11px] leading-snug text-hf-text-4">
          Минимальные платежи идут всегда. Здесь — куда уходит всё, что остаётся сверх обычных трат.
        </p>
      </div>

      <div className="space-y-1.5">
        {MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => mode !== settings.priority_mode && save({ priority_mode: mode })}
            className={cn(
              'w-full rounded-[12px] border px-3.5 py-2.5 text-left transition-colors',
              settings.priority_mode === mode ? 'border-hf-accent bg-hf-card' : 'border-transparent bg-hf-card',
            )}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-medium text-hf-text">{MODE_META[mode].label}</span>
              {settings.priority_mode === mode && <span className="h-2 w-2 rounded-full bg-hf-accent" />}
            </span>
            <span className="mt-0.5 block text-[11px] leading-snug text-hf-text-4">{MODE_META[mode].description}</span>
          </button>
        ))}
      </div>

      {settings.priority_mode === 'split' && (
        <label className="flex items-center justify-between gap-3">
          <span className="text-[13px] text-hf-text-2">В долги, %</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            step={10}
            value={draft.split}
            onChange={(e) => setDraft((d) => ({ ...d, split: e.target.value }))}
            onBlur={() => saveNumber('split_debt_pct', draft.split, 0, 100)}
            className={numberClass}
          />
        </label>
      )}
      {settings.priority_mode === 'ladder' && (
        <label className="flex items-center justify-between gap-3">
          <span className="text-[13px] text-hf-text-2">Дорогой долг — ставка от, %</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            value={draft.rate}
            onChange={(e) => setDraft((d) => ({ ...d, rate: e.target.value }))}
            onBlur={() => saveNumber('high_rate_threshold', draft.rate, 0, 100)}
            className={numberClass}
          />
        </label>
      )}
      <label className="flex items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-[13px] text-hf-text-2">Подушка, месяцев расходов</span>
          {month && (
            <span className="block text-[11px] text-hf-text-4">
              {formatMoney(month.plan.cushionTarget)}
              {cushionGoal ? ` · накоплено ${formatMoney(cushionGoal.current_amount)}` : ''}
            </span>
          )}
        </span>
        <input
          type="number"
          inputMode="decimal"
          min={1}
          max={12}
          value={draft.cushion}
          onChange={(e) => setDraft((d) => ({ ...d, cushion: e.target.value }))}
          onBlur={() => saveNumber('cushion_months', draft.cushion, 1, 12)}
          className={numberClass}
        />
      </label>
      {!cushionGoal && month && (
        <button
          type="button"
          onClick={createCushion}
          disabled={addGoal.isPending}
          className="w-full rounded-[12px] bg-hf-card py-2.5 text-[13px] text-hf-accent-on-dark disabled:opacity-50"
        >
          Завести подушку на {formatMoney(month.plan.cushionTarget)}
        </button>
      )}

      <div className="space-y-2">
        <p className="text-[13px] text-hf-text-2">Порядок погашения долгов</p>
        <div className="flex rounded-[12px] bg-hf-card p-1">
          {STRATEGIES.map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => st !== settings.debt_strategy && save({ debt_strategy: st })}
              className={cn(
                'flex-1 rounded-[9px] py-2 text-[13px] transition-colors',
                settings.debt_strategy === st ? 'bg-hf-accent font-medium text-white' : 'text-hf-text-4',
              )}
            >
              {STRATEGY_META[st].label}
            </button>
          ))}
        </div>
        <p className="text-[11px] leading-snug text-hf-text-4">{STRATEGY_META[settings.debt_strategy].why}</p>
      </div>

      {month && (
        <p className="rounded-[12px] bg-hf-card px-3.5 py-2.5 text-[12px] leading-snug text-hf-text-3">
          {[
            month.plan.hasDebts && `долги закроются: ${month.plan.debtFreeDate ? formatMonthYear(month.plan.debtFreeDate) : 'не закроются при таких деньгах'}`,
            `подушка: ${month.plan.cushionFullDate ? formatMonthYear(month.plan.cushionFullDate) : 'не наберётся'}`,
            month.plan.goalsStartDate && `на цели — с месяца: ${formatMonthYear(month.plan.goalsStartDate)}`,
          ]
            .filter(Boolean)
            .join(' · ')
            .replace(/^/, 'С этими настройками — ')}
        </p>
      )}
    </div>
  )
}
