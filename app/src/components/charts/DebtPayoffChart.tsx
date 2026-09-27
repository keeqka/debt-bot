import { useMemo } from 'react'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { formatMoney } from '@/lib/format'
import type { DebtStrategy, PlanResult } from '@/lib/budget'
import { STRATEGY_META } from '@/lib/plan-text'

const STRATEGIES: DebtStrategy[] = ['avalanche', 'snowball', 'cash_flow']
/** Выбранная стратегия — акцентом, остальные — приглушёнными тонами той же гаммы. */
const ACCENT = '#3c82c8'
const MUTED = ['#8fafce', '#5d7892']

function compactMoney(value: number) {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}М`
  if (Math.abs(value) >= 1_000) return `${Math.round(value / 1_000)}К`
  return String(value)
}

export function DebtPayoffChart({ timelines, selected }: { timelines: Record<DebtStrategy, PlanResult>; selected: DebtStrategy }) {
  const config: ChartConfig = useMemo(() => {
    let muted = 0
    return Object.fromEntries(
      STRATEGIES.map((st) => [st, { label: STRATEGY_META[st].label, color: st === selected ? ACCENT : MUTED[muted++ % MUTED.length] }]),
    )
  }, [selected])

  const data = useMemo(() => {
    const length = Math.max(...STRATEGIES.map((st) => timelines[st].timeline.length))
    return Array.from({ length }, (_, i) => ({
      month: i,
      ...Object.fromEntries(STRATEGIES.map((st) => [st, timelines[st].timeline[i]?.debt ?? 0])),
    }))
  }, [timelines])

  if (!timelines[selected].hasDebts || data.length < 2) return null

  return (
    <div className="space-y-2.5">
      <p className="font-mono text-[11px] tracking-[0.1em] text-hf-text-4 uppercase">Погашение по месяцам</p>
      <ChartContainer config={config} className="h-[180px] w-full">
        <AreaChart data={data} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#2e333b" />
          <XAxis
            dataKey="month"
            tickFormatter={(m) => `${m} мес`}
            tickLine={false}
            axisLine={false}
            tickMargin={6}
            fontSize={11}
            stroke="#98a2ae"
            interval="preserveStartEnd"
          />
          <YAxis tickFormatter={compactMoney} tickLine={false} axisLine={false} tickMargin={4} fontSize={11} stroke="#98a2ae" width={44} />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(m) => `${m} мес`}
                formatter={(value, name) => [` ${formatMoney(Number(value))}`, config[name as string]?.label ?? String(name)]}
              />
            }
          />
          {/* Выбранная рисуется последней — поверх остальных. */}
          {[...STRATEGIES.filter((st) => st !== selected), selected].map((st) => (
            <Area
              key={st}
              dataKey={st}
              type="monotone"
              stroke={`var(--color-${st})`}
              fill={`var(--color-${st})`}
              fillOpacity={st === selected ? 0.18 : 0.06}
              strokeWidth={st === selected ? 2 : 1.5}
            />
          ))}
        </AreaChart>
      </ChartContainer>
    </div>
  )
}
