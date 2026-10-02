import { useMemo } from 'react'
import { FormSheet, Segmented } from '@/components/chrome/FormSheet'
import { Paper } from '@/components/chrome/Paper'
import { MascotAvatar } from '@/components/Mascot'
import { useBudgetInput, useHouseholdSettings, useUpdateHouseholdSettings } from '@/hooks/use-finance-data'
import { forecast, type Forecast, type ForecastMode } from '@/lib/forecast'
import { formatMoney, formatMoneyCompact } from '@/lib/format'
import { cn } from '@/lib/utils'

const MODES: Array<{ value: ForecastMode; label: string }> = [
  { value: 'cautious', label: 'Осторожный' },
  { value: 'normal', label: 'Обычный' },
  { value: 'optimistic', label: 'Оптимист' },
]

const MODE_HINT: Record<ForecastMode, string> = {
  cautious: 'Темп по самой дорогой неделе месяца.',
  normal: 'Средний темп трат за месяц.',
  optimistic: 'По обычному дню — без редких крупных трат.',
}

function shortDate(iso: string) {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(new Date(iso + 'T00:00:00'))
}

/**
 * Прогноз конца месяца (02): куда придёт месяц, если тратить в том же темпе, с
 * регулярными платежами по датам. Режим сохраняется в настройках семьи.
 */
export function ForecastSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const input = useBudgetInput()
  const { data: settings } = useHouseholdSettings()
  const update = useUpdateHouseholdSettings()
  const mode: ForecastMode = settings?.forecast_mode ?? 'normal'

  const f = useMemo(() => (input && open ? forecast(input, mode) : null), [input, open, mode])

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Прогноз до конца месяца"
      footer={
        <button type="button" onClick={() => onOpenChange(false)} className="min-h-11 w-full rounded-[13px] bg-hf-card py-3 text-[15px] text-hf-text-2">
          Готово
        </button>
      }
    >
      {!f ? (
        <div className="h-56 animate-pulse rounded-[18px] bg-hf-card" />
      ) : (
        <>
          <Paper className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-2.5">
              <span className="font-mono text-[11px] tracking-[0.1em] text-hf-ink-soft uppercase">К {shortDate(f.periodEnd)}</span>
              <span className="font-mono text-[11px] text-hf-ink-soft">
                день {f.dayOfPeriod} из {f.days}
              </span>
            </div>
            {f.hasIncome ? (
              <div className="flex flex-wrap items-baseline gap-x-2.5">
                <span className={cn('text-[30px] leading-none font-bold tracking-[-0.03em]', f.endAvailable < 0 && 'text-hf-warn-ink')}>
                  {formatMoney(f.endAvailable)}
                </span>
                <span className={cn('font-mono text-[11px]', f.endAvailable < 0 ? 'text-hf-warn-ink' : 'text-hf-ink-soft')}>
                  {f.endAvailable < 0 ? 'выход за бюджет' : 'останется'}
                </span>
              </div>
            ) : (
              <p className="text-[13px] text-hf-ink-soft">Укажи доход в настройках — тогда покажу, сколько останется к концу месяца.</p>
            )}
            <ForecastChart f={f} />
            <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-hf-ink-soft">
              <Legend color="#3C82C8" label="факт" />
              <Legend color="#C0632F" label="прогноз" dashed />
              {f.hasIncome && <Legend color="#8FAFCE" label="лимит" dashed />}
            </div>
          </Paper>

          <div className="space-y-1.5">
            <Segmented value={mode} onChange={(v) => update.mutate({ forecast_mode: v })} options={MODES} />
            <p className="text-[11px] text-hf-text-4">{MODE_HINT[mode]}</p>
          </div>

          <div className="flex items-start gap-3 rounded-[16px] bg-hf-card p-3.5">
            <MascotAvatar size={34} expression={f.hasIncome && f.endAvailable < 0 ? 'alert' : 'calm'} />
            <p className="min-w-0 text-[13px] leading-snug text-hf-text-2">{commentary(f)}</p>
          </div>
        </>
      )}
    </FormSheet>
  )
}

function commentary(f: Forecast): string {
  const fixed = f.fixedFuture.length
    ? ` Впереди ${f.fixedFuture.length} регулярных ${f.fixedFuture.length === 1 ? 'платёж' : 'платежа'} на ${formatMoney(f.fixedFuture.reduce((s, x) => s + x.amount, 0))}.`
    : ''
  if (!f.hasIncome) return `Пока считаю только факты: ${formatMoney(f.spent)} за ${f.dayOfPeriod} дн. Темп — ${formatMoney(f.dailyPace)} в день.${fixed}`
  if (f.endAvailable < 0) {
    const where = f.topOverspend ? ` Главный перебор — «${f.topOverspend.name}».` : ''
    return `Чтобы выйти в ноль, трать до ${formatMoney(f.perDayToZero)} в день — сейчас выходит ${formatMoney(f.dailyPace)}.${where}${fixed}`
  }
  return `Идёшь в плане: к концу останется ${formatMoney(f.endAvailable)}. Можно тратить до ${formatMoney(f.perDayToZero)} в день.${fixed}`
}

function Legend({ color, label, dashed = false }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <svg width="16" height="4" aria-hidden="true">
        <line x1="0" y1="2" x2="16" y2="2" stroke={color} strokeWidth="2" strokeDasharray={dashed ? '3 2' : undefined} />
      </svg>
      {label}
    </span>
  )
}

/** Накопленные траты по дням: факт сплошной, прогноз и лимит пунктиром. */
function ForecastChart({ f }: { f: Forecast }) {
  const W = 300
  const H = 130
  const pad = { l: 4, r: 4, t: 8, b: 14 }
  const maxY = Math.max(f.projectedSpent, f.hasIncome ? f.limit : 0, f.spent, 1) * 1.05
  const x = (d: number) => pad.l + ((d - 1) / Math.max(1, f.days - 1)) * (W - pad.l - pad.r)
  const y = (v: number) => pad.t + (1 - v / maxY) * (H - pad.t - pad.b)
  const path = (points: Array<{ day: number; v: number | null }>) =>
    points
      .filter((p): p is { day: number; v: number } => p.v != null)
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.day).toFixed(1)},${y(p.v).toFixed(1)}`)
      .join(' ')

  const fact = path(f.series.map((p) => ({ day: p.day, v: p.fact })))
  const proj = path(f.series.map((p) => ({ day: p.day, v: p.forecast })))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="График накопленных трат" className="h-auto w-full">
      <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="#DED6C8" strokeWidth="1" />
      {f.hasIncome && f.limit > 0 && (
        <line x1={pad.l} x2={W - pad.r} y1={y(f.limit)} y2={y(f.limit)} stroke="#8FAFCE" strokeWidth="1.5" strokeDasharray="5 3" />
      )}
      <path d={proj} fill="none" stroke="#C0632F" strokeWidth="2" strokeDasharray="4 3" strokeLinejoin="round" />
      <path d={fact} fill="none" stroke="#3C82C8" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      <text x={pad.l} y={H - 2} fontSize="9" fill="#7B7568" fontFamily="JetBrains Mono Variable, monospace">1</text>
      <text x={W - pad.r} y={H - 2} fontSize="9" fill="#7B7568" textAnchor="end" fontFamily="JetBrains Mono Variable, monospace">{f.days}</text>
      <text x={W - pad.r} y={Math.max(10, y(f.projectedSpent) - 4)} fontSize="9" fill="#C0632F" textAnchor="end" fontFamily="JetBrains Mono Variable, monospace">
        {formatMoneyCompact(f.projectedSpent)}
      </text>
    </svg>
  )
}
