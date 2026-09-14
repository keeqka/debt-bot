import { useMemo } from 'react'
import { Cell, Pie, PieChart } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import type { Category, Expense } from '@/types/domain'
import { formatMoney, formatPercent } from '@/lib/format'

const PALETTE = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
]

export function CategoryDonutChart({ expenses, categories }: { expenses: Expense[]; categories: Category[] }) {
  const { data, config, total } = useMemo(() => {
    const byCategory = new Map<string, number>()
    for (const e of expenses) {
      const key = e.category_id ?? 'uncategorized'
      byCategory.set(key, (byCategory.get(key) ?? 0) + e.amount)
    }
    const rows = [...byCategory.entries()]
      .map(([categoryId, amount], i) => {
        const category = categories.find((c) => c.id === categoryId)
        return {
          key: categoryId,
          label: category?.name ?? 'Без категории',
          amount,
          fill: PALETTE[i % PALETTE.length],
        }
      })
      .sort((a, b) => b.amount - a.amount)

    const chartConfig: ChartConfig = Object.fromEntries(
      rows.map((r) => [r.key, { label: r.label, color: r.fill }]),
    )
    const totalAmount = rows.reduce((sum, r) => sum + r.amount, 0)
    return { data: rows, config: chartConfig, total: totalAmount }
  }, [expenses, categories])

  if (data.length === 0) {
    return <p className="text-muted-foreground py-8 text-center text-sm">Пока нет расходов за период</p>
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <ChartContainer config={config} className="aspect-square h-[110px] w-[110px] shrink-0">
        <PieChart>
          <ChartTooltip content={<ChartTooltipContent hideLabel />} />
          <Pie data={data} dataKey="amount" nameKey="label" innerRadius={30} outerRadius={50} strokeWidth={2}>
            {data.map((entry) => (
              <Cell key={entry.key} fill={entry.fill} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {data.map((row) => (
          <li key={row.key} className="flex min-w-0 items-center gap-1.5 text-xs">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: row.fill }} />
            <span className="min-w-0 flex-1 truncate">{row.label}</span>
            <span className="text-muted-foreground shrink-0">{formatPercent(row.amount / total)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function categoryTotalLabel(expenses: Expense[]) {
  return formatMoney(expenses.reduce((sum, e) => sum + e.amount, 0))
}
