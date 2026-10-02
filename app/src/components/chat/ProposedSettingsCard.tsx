import { Settings2 } from 'lucide-react'
import { MODE_META, STRATEGY_META } from '@/lib/plan-text'
import { formatMoney, formatMonthYear } from '@/lib/format'
import type { ProposedSettings } from '@/types/domain'

function changeLines(p: ProposedSettings): string[] {
  const h = p.household ?? {}
  const u = p.user ?? {}
  return [
    h.priority_mode && `Режим: ${MODE_META[h.priority_mode].label}`,
    h.debt_strategy && `Стратегия: ${STRATEGY_META[h.debt_strategy].label}`,
    h.cushion_months != null && `Подушка: ${h.cushion_months} мес. расходов`,
    h.split_debt_pct != null && `В долги: ${h.split_debt_pct}%, в накопления: ${100 - h.split_debt_pct}%`,
    h.high_rate_threshold != null && `Дорогие долги — от ${h.high_rate_threshold}%`,
    h.period_start_day !== undefined && `Бюджетный месяц: ${h.period_start_day == null ? 'календарный' : `с ${h.period_start_day}-го числа`}`,
    u.monthly_income !== undefined && `Доход в месяц: ${u.monthly_income == null ? 'не указан' : formatMoney(u.monthly_income)}`,
    u.payday !== undefined && `День зарплаты: ${u.payday ?? 'не указан'}`,
    u.daily_reminder_enabled !== undefined && `Напоминание о чеках: ${u.daily_reminder_enabled ? 'включить' : 'выключить'}`,
    u.daily_reminder_time && `Время напоминания: ${u.daily_reminder_time.slice(0, 5)}`,
  ].filter(Boolean) as string[]
}

function previewLines(p: ProposedSettings): string[] {
  const v = p.preview
  if (!v) return []
  const month = (d: string | null) => (d ? formatMonthYear(d) : '—')
  return [
    v.debt_free_before !== v.debt_free_after && `Долги закроются: ${month(v.debt_free_before)} → ${month(v.debt_free_after)}`,
    v.interest_before !== v.interest_after && `Переплата: ${formatMoney(v.interest_before)} → ${formatMoney(v.interest_after)}`,
    v.cushion_full_before !== v.cushion_full_after && `Подушка наберётся: ${month(v.cushion_full_before)} → ${month(v.cushion_full_after)}`,
    v.per_day_before !== v.per_day_after && `Можно тратить в день: ${formatMoney(v.per_day_before)} → ${formatMoney(v.per_day_after)}`,
  ].filter(Boolean) as string[]
}

/**
 * Смена настроек, предложенная «Чеком». Ничего не меняется до тапа — и до
 * тапа видно, к чему это приведёт (последствия посчитаны сервером той же
 * моделью бюджета, что и приложение).
 */
export function ProposedSettingsCard({
  proposal,
  applied,
  pending,
  onApply,
}: {
  proposal: ProposedSettings
  applied: boolean
  pending: boolean
  onApply: () => void
}) {
  const changes = changeLines(proposal)
  const effects = previewLines(proposal)
  if (!changes.length) return null
  return (
    <div className="ml-9 w-fit max-w-[82%] space-y-2 rounded-[16px_16px_16px_4px] bg-hf-card p-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-hf-text">
        <Settings2 className="h-3.5 w-3.5" />
        Изменить настройки
      </div>
      <ul className="space-y-0.5 text-xs text-hf-text-2">
        {changes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      {effects.length > 0 && (
        <ul className="space-y-0.5 border-t border-hf-line pt-2 font-mono text-[11px] text-hf-text-4">
          {effects.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={onApply}
        disabled={applied || pending}
        className="w-full rounded-[10px] bg-hf-accent py-2 text-xs font-medium text-white disabled:opacity-50"
      >
        {applied ? 'Применено' : 'Применить'}
      </button>
    </div>
  )
}
