import { useState } from 'react'
import { Plus, ChevronRight } from 'lucide-react'
import { Eyebrow } from '@/components/chrome/Chrome'
import { Paper } from '@/components/chrome/Paper'
import { ProgressBar } from '@/components/chrome/ProgressBar'
import { useGoals } from '@/hooks/use-finance-data'
import { formatMoney, formatMoneyCompact, formatMoneyShort, formatPercent } from '@/lib/format'
import { goalMath, monthLabel } from '@/lib/goal'
import { AddGoalDialog } from '@/components/goals/AddGoalDialog'
import { GoalDetailSheet } from '@/components/goals/GoalDetailSheet'
import type { Goal } from '@/types/domain'

/**
 * Цели как раздел «Обзора», а не пятый таб: нижняя панель рассчитана на
 * четыре иконки, а цель без контекста месяца — просто цифра на экране.
 * Здесь она стоит сразу под тем, сколько можно тратить, и читается как ответ
 * на вопрос «куда девать свободные деньги».
 *
 * Первая цель показана бумажной карточкой целиком (это твои цифры), остальные —
 * тёмными строками: один вывод за раз, список целей не должен спорить
 * с главной цифрой экрана.
 */
export function GoalsSection() {
  const { data: goals } = useGoals()
  const [addOpen, setAddOpen] = useState(false)
  const [detail, setDetail] = useState<Goal | null>(null)

  const active = (goals ?? []).filter((g) => g.status === 'active')
  const [first, ...rest] = active

  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between gap-2.5">
        <Eyebrow>Цели</Eyebrow>
        {active.length > 0 && (
          <button type="button" onClick={() => setAddOpen(true)} className="flex items-center gap-1 text-[11px] text-hf-accent-on-dark">
            <Plus className="h-3 w-3" />
            новая
          </button>
        )}
      </div>

      {!first ? (
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="flex w-full items-center justify-between gap-3 rounded-[16px] bg-hf-card px-3.5 py-3 text-left"
        >
          <span className="min-w-0">
            <span className="block text-[13px] font-medium text-hf-text">Поставь цель — посчитаю, сколько откладывать</span>
            <span className="block text-[11px] text-hf-text-4">Свободные деньги месяца пока никуда не идут</span>
          </span>
          <Plus className="h-4 w-4 shrink-0 text-hf-text-4" />
        </button>
      ) : (
        <GoalPaperCard goal={first} onOpen={() => setDetail(first)} />
      )}

      {rest.map((goal) => (
        <GoalCompactRow key={goal.id} goal={goal} onOpen={() => setDetail(goal)} />
      ))}

      <AddGoalDialog open={addOpen} onOpenChange={setAddOpen} />
      <GoalDetailSheet goal={detail} open={Boolean(detail)} onOpenChange={(open) => !open && setDetail(null)} />
    </section>
  )
}

function GoalPaperCard({ goal, onOpen }: { goal: Goal; onOpen: () => void }) {
  const math = goalMath(goal)
  return (
    <button type="button" onClick={onOpen} className="block w-full text-left">
      <Paper className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2.5">
          <span className="min-w-0 truncate text-sm font-medium">{goal.title}</span>
          <span className="shrink-0 font-mono text-[11px] text-hf-ink-soft">
            {goal.target_date ? `до ${monthLabel(goal.target_date)}` : 'без срока'}
          </span>
        </div>

        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span className="text-[30px] leading-none font-bold tracking-[-0.03em]">{formatMoneyCompact(goal.current_amount, goal.currency)}</span>
          <span className="font-mono text-[11px] text-hf-ink-soft">из {formatMoneyCompact(goal.target_amount, goal.currency)}</span>
        </div>

        <ProgressBar pct={math.pct} onPaper />

        <div className="flex justify-between gap-2.5 text-[13px]">
          <span>{math.done ? 'Цель собрана' : 'Откладывать в месяц'}</span>
          <span className="font-mono text-hf-accent-ink">
            {math.done ? formatMoney(goal.target_amount, goal.currency) : math.monthlyNeeded ? formatMoney(math.monthlyNeeded, goal.currency) : '—'}
          </span>
        </div>
      </Paper>
    </button>
  )
}

function GoalCompactRow({ goal, onOpen }: { goal: Goal; onOpen: () => void }) {
  const math = goalMath(goal)
  return (
    <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 rounded-[16px] bg-hf-card px-3.5 py-3 text-left">
      <span className="min-w-0 flex-1 space-y-1.5">
        <span className="flex items-baseline justify-between gap-2.5">
          <span className="min-w-0 truncate text-[13px] text-hf-text">{goal.title}</span>
          <span className="shrink-0 font-mono text-[11px] whitespace-nowrap text-hf-text-4">
            {formatMoneyShort(goal.current_amount, goal.currency)} · {formatPercent(math.pct / 100)}
          </span>
        </span>
        <ProgressBar pct={math.pct} tone="soft" height={5} />
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-hf-text-4" />
    </button>
  )
}
