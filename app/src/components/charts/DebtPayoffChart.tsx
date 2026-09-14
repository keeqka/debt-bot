import { useMemo } from 'react'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { simulateDebtTimeline } from '@/lib/debt-strategy'
import { formatMoney } from '@/lib/format'
import type { Debt } from '@/types/domain'

const CONFIG: ChartConfig = {
  optimal: { label: 'Оптимальная', color: 'var(--chart-2)' },
  aggressive: { label: 'Агрессивная', color: 'var(--chart-5)' },
}

function compactMoney(value: number) {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}М`
  if (Math.abs(value) >= 1_000) return `${Math.round(value / 1_000)}К`
  return String(value)
}

export function DebtPayoffChart({ debts, monthlySurplus }: { debts: Debt[]; monthlySurplus: number }) {
  const data = useMemo(() => {
    const optimal = simulateDebtTimeline({ debts, monthlySurplus, strategy: 'optimal' })
    const aggressive = simulateDebtTimeline({ debts, monthlySurplus, strategy: 'aggressive' })
    const length = Math.max(optimal.length, aggressive.length)

    return Array.from({ length }, (_, i) => ({
      month: i,
      optimal: i < optimal.length ? optimal[i].balance : 0,
      aggressive: i < aggressive.length ? aggressive[i].balance : 0,
    }))
  }, [debts, monthlySurplus])

  if (debts.length === 0 || data.length < 2) return null

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold">Погашение по месяцам</p>
      <ChartContainer config={CONFIG} className="h-[180px] w-full">
        <AreaChart data={data} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="month"
            tickFormatter={(m) => `${m} мес.`}
            tickLine={false}
            axisLine={false}
            tickMargin={6}
            fontSize={10}
            interval="preserveStartEnd"
          />
          <YAxis tickFormatter={compactMoney} tickLine={false} axisLine={false} tickMargin={4} fontSize={10} width={40} />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(m) => `${m} мес.`}
                formatter={(value, name) => [` ${formatMoney(Number(value))}`, CONFIG[name as string]?.label ?? String(name)]}
              />
            }
          />
          <Area dataKey="optimal" type="monotone" stroke="var(--color-optimal)" fill="var(--color-optimal)" fillOpacity={0.15} strokeWidth={2} />
          <Area dataKey="aggressive" type="monotone" stroke="var(--color-aggressive)" fill="var(--color-aggressive)" fillOpacity={0.15} strokeWidth={2} />
        </AreaChart>
      </ChartContainer>
    </div>
  )
}
