import { useEffect, useState } from 'react'
import { useHouseholdSettings, useMonth, useUpdateHouseholdSettings } from '@/hooks/use-finance-data'
import { useCurrentUser } from '@/lib/auth'
import { cn } from '@/lib/utils'

const numberClass =
  'h-9 w-20 rounded-[10px] border border-hf-line bg-hf-bar px-2.5 text-right font-mono text-[13px] text-hf-text focus:border-hf-accent focus:outline-none'

/**
 * Бюджетный месяц: календарный (1-е — последнее число) или от дня зарплаты до
 * следующего. От него считаются «осталось в день», обычные траты и «обычно к
 * этому числу» — household_settings.period_start_day (null — календарный).
 */
export function BudgetPeriodSection() {
  const { data: settings } = useHouseholdSettings()
  const update = useUpdateHouseholdSettings()
  const user = useCurrentUser()
  const month = useMonth()
  const [day, setDay] = useState('')

  useEffect(() => {
    setDay(settings?.period_start_day != null ? String(settings.period_start_day) : '')
  }, [settings?.period_start_day])

  if (!settings) return null
  const fromPayday = settings.period_start_day != null

  function saveDay() {
    const n = Math.round(Number(day))
    if (!day.trim() || !Number.isFinite(n)) return setDay(String(settings!.period_start_day ?? ''))
    const value = Math.min(31, Math.max(1, n))
    setDay(String(value))
    if (value !== settings!.period_start_day) update.mutate({ period_start_day: value })
  }

  return (
    <div className="space-y-3 border-t border-hf-line pt-4">
      <div className="space-y-1">
        <p className="text-[13px] font-medium text-hf-text">Бюджетный месяц</p>
        <p className="text-[11px] leading-snug text-hf-text-4">
          От этого зависит, сколько можно тратить в день и что считается «обычными тратами».
        </p>
      </div>
      <div className="flex rounded-[12px] bg-hf-card p-1">
        {([false, true] as const).map((payday) => (
          <button
            key={String(payday)}
            type="button"
            onClick={() => update.mutate({ period_start_day: payday ? (user.payday ?? 1) : null })}
            className={cn(
              'flex-1 rounded-[9px] py-2 text-[13px] transition-colors',
              fromPayday === payday ? 'bg-hf-accent font-medium text-white' : 'text-hf-text-4',
            )}
          >
            {payday ? 'От зарплаты' : 'Календарный'}
          </button>
        ))}
      </div>
      {fromPayday && (
        <label className="flex items-center justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-[13px] text-hf-text-2">Месяц начинается с числа</span>
            {month && <span className="block text-[11px] text-hf-text-4">Сейчас: {month.label}</span>}
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={31}
            value={day}
            onChange={(e) => setDay(e.target.value)}
            onBlur={saveDay}
            className={numberClass}
          />
        </label>
      )}
    </div>
  )
}
