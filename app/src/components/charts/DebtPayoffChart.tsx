import { useMemo } from 'react'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { simulateDebtTimeline } from '@/lib/debt-strategy'
import { formatMoney } from '@/lib/format'
import type { Debt } from '@/types/domain'

const CONFIG: ChartConfig = {
  avalanche: { label: 'Лавина', color: 'var(--chart-2)' },
  snowball: { label: 'Снежный ком', color: 'var(--chart-5)' },
}

function compactMoney(value: number) {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}М`
  if (Math.abs(value) >= 1_000) return `${Math.round(value / 1_000)}К`
  return String(value)
}

export function DebtPayoffChart({ debts, monthlySurplus }: { debts: Debt[]; monthlySurplus: number }) {
  const data = useMemo(() => {
    const avalanche = simulateDebtTimeline({ debts, monthlySurplus, strategy: 'avalanche' })
    const snowball = simulateDebtTimeline({ debts, monthlySurplus, strategy: 'snowball' })
    const length = Math.max(avalanche.length, snowball.length)

    return Array.from({ length }, (_, i) => ({
      month: i,
      avalanche: i < avalanche.length ? avalanche[i].balance : 0,
      snowball: i < snowball.length ? snowball[i].balance : 0,
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
          <Area dataKey="avalanche" type="monotone" stroke="var(--color-avalanche)" fill="var(--color-avalanche)" fillOpacity={0.15} strokeWidth={2} />
          <Area dataKey="snowball" type="monotone" stroke="var(--color-snowball)" fill="var(--color-snowball)" fillOpacity={0.15} strokeWidth={2} />
        </AreaChart>
      </ChartContainer>
    </div>
  )
}
