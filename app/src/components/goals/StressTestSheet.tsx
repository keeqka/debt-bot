import { useMemo, useState } from 'react'
import { FormSheet, FormField, formInputClass } from '@/components/chrome/FormSheet'
import { Paper, PaperRow } from '@/components/chrome/Paper'
import { ProgressBar } from '@/components/chrome/ProgressBar'
import { useBudgetInput } from '@/hooks/use-finance-data'
import { stressTest, type StressScenario } from '@/lib/stress'
import { formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'

const SCENARIOS: Array<{ id: StressScenario; label: string }> = [
  { id: 'income_minus_30', label: 'Доход −30%' },
  { id: 'job_loss', label: 'Потеря работы' },
  { id: 'rate_plus_5', label: 'Ставка +5%' },
  { id: 'custom', label: 'Свой' },
]

const mo = (n: number | null) => (n == null ? 'не тратится' : `${String(n).replace('.', ',')} мес`)

/** «Что если…» (01): на сколько месяцев хватит подушки в плохом сценарии. Только расчёт — ничего не сохраняется. */
export function StressTestSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const input = useBudgetInput()
  const [scenario, setScenario] = useState<StressScenario>('income_minus_30')
  const [custom, setCustom] = useState('')

  const r = useMemo(() => (input && open ? stressTest(input, scenario, Number(custom) || 0) : null), [input, open, scenario, custom])
  const short = r != null && r.coverMonths != null && r.coverMonths < r.targetMonths

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Что если…"
      footer={
        <button type="button" onClick={() => onOpenChange(false)} className="min-h-11 w-full rounded-[13px] bg-hf-card py-3 text-[15px] text-hf-text-2">
          Готово
        </button>
      }
    >
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Сценарий">
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={scenario === s.id}
            onClick={() => setScenario(s.id)}
            className={cn(
              'min-h-11 rounded-[10px] px-3.5 py-2 text-[13px]',
              scenario === s.id ? 'bg-hf-accent font-medium text-white' : 'bg-hf-card text-hf-text-3',
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {scenario === 'custom' && (
        <FormField label="Доход в месяц, ₸">
          <input type="number" inputMode="numeric" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="0" className={formInputClass} />
        </FormField>
      )}

      {!r ? (
        <div className="h-48 animate-pulse rounded-[18px] bg-hf-card" />
      ) : (
        <>
          <Paper className="flex flex-col gap-2.5">
            <span className="font-mono text-[11px] tracking-[0.1em] text-hf-ink-soft uppercase">Подушки хватит на</span>
            <span className={cn('text-[30px] leading-none font-bold tracking-[-0.03em]', short && 'text-hf-warn-ink')}>{mo(r.coverMonths)}</span>
            <ProgressBar pct={r.coverMonths == null ? 100 : Math.min(100, (r.coverMonths / Math.max(1, r.targetMonths)) * 100)} tone={short ? 'warn' : 'accent'} onPaper />
            <p className="text-[11px] text-hf-ink-soft">
              Цель из настроек — {r.targetMonths} мес
              {r.coverMonths != null && r.coverMonths < r.targetMonths ? `, не хватает ${String(Math.round((r.targetMonths - r.coverMonths) * 10) / 10).replace('.', ',')} мес.` : '.'}
            </p>
            <div className="h-px bg-hf-receipt-line" />
            <PaperRow label="Доход" value={formatMoney(r.income)} />
            <PaperRow label="Обычные траты" value={formatMoney(r.spend)} />
            <PaperRow label="Платежи по долгам" value={formatMoney(r.payments)} />
            <PaperRow label="Уходит из подушки" value={r.burn > 0 ? `${formatMoney(r.burn)} / мес` : 'ничего'} tone={r.burn > 0 ? 'warn' : 'accent'} />
          </Paper>

          {r.burn > 0 && r.cuts.length > 0 && (
            <div className="space-y-2 rounded-[16px] bg-hf-card p-3.5">
              <span className="font-mono text-[11px] tracking-[0.1em] text-hf-text-4 uppercase">Режем первыми</span>
              {r.cuts.map((c) => (
                <div key={c.name} className="flex justify-between gap-2.5 text-[13px] text-hf-text-2">
                  <span className="min-w-0 truncate">{c.name}</span>
                  <span className="font-mono">{formatMoney(c.avg)} / мес</span>
                </div>
              ))}
              <div className="flex justify-between gap-2.5 border-t border-hf-line pt-2 text-[13px] font-medium text-hf-text">
                <span>После урезки</span>
                <span className="font-mono text-hf-accent-on-dark">{mo(r.monthsAfterCuts)}</span>
              </div>
            </div>
          )}
          {r.burn > 0 && r.cuts.length === 0 && (
            <p className="text-[12px] leading-relaxed text-hf-text-3">
              Урезать пока нечего: у категорий нет пометки «желание». Отметь их в настройках — и здесь появится список, что резать первым.
            </p>
          )}
          <p className="text-[11px] text-hf-text-4">Это расчёт: ничего не меняется и не сохраняется.</p>
        </>
      )}
    </FormSheet>
  )
}
