import { useMemo } from 'react'
import { Cell, Pie, PieChart } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import type { Category, Expense } from '@/types/domain'
import { formatMoney, formatPercent } from '@/lib/format'

/**
 * Градации акцента вместо шести произвольных цветов: категории читаются как
 * «больше — темнее», а не как шесть равнозначных сущностей. Последний тон —
 * тревожный, на него попадает самая мелкая категория только если их 5+,
 * поэтому правило «тревожный цвет раз на экран» не нарушается.
 */
const PALETTE = ['#3c82c8', '#5b96d3', '#8fafce', '#b3c8de', '#c5d6e8', '#6b7a8c']

export function CategoryDonutChart({ expenses, categories }: { expenses: Expense[]; categories: Category[] }) {
  const { data, config, total } = useMemo(() => {
    const byCategory = new Map<string, number>()
    for (const e of expenses) {
      const key = e.category_id ?? 'uncategorized'
      byCategory.set(key, (byCategory.get(key) ?? 0) + e.amount)
    }
    const rows = [...byCategory.entries()]
      .map(([categoryId, amount]) => {
        const category = categories.find((c) => c.id === categoryId)
        return { key: categoryId, label: category?.name ?? 'Без категории', amount, fill: '' }
      })
      .sort((a, b) => b.amount - a.amount)
      .map((r, i) => ({ ...r, fill: PALETTE[i % PALETTE.length] }))

    const chartConfig: ChartConfig = Object.fromEntries(rows.map((r) => [r.key, { label: r.label, color: r.fill }]))
    const totalAmount = rows.reduce((sum, r) => sum + r.amount, 0)
    return { data: rows, config: chartConfig, total: totalAmount }
  }, [expenses, categories])

  if (data.length === 0) {
    return <p className="py-8 text-center text-[13px] text-hf-text-4">Пока нет расходов за период</p>
  }

  return (
    <div className="flex min-w-0 items-center gap-3">
      <ChartContainer config={config} className="aspect-square h-[110px] w-[110px] shrink-0">
        <PieChart>
          <ChartTooltip content={<ChartTooltipContent hideLabel />} />
          <Pie data={data} dataKey="amount" nameKey="label" innerRadius={30} outerRadius={50} strokeWidth={0}>
            {data.map((entry) => (
              <Cell key={entry.key} fill={entry.fill} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {data.map((row) => (
          <li key={row.key} className="flex min-w-0 items-center gap-2 text-[13px]">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: row.fill }} />
            <span className="min-w-0 flex-1 truncate text-hf-text-2">{row.label}</span>
            <span className="shrink-0 font-mono text-[11px] text-hf-text-4">{formatPercent(row.amount / total)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function categoryTotalLabel(expenses: Expense[]) {
  return formatMoney(expenses.reduce((sum, e) => sum + e.amount, 0))
}
