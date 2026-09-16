import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, FileText, ChevronRight } from 'lucide-react'
import { Eyebrow } from '@/components/chrome/Chrome'
import { Paper } from '@/components/chrome/Paper'
import { ProgressBar } from '@/components/chrome/ProgressBar'
import { MascotAvatar, Mascot } from '@/components/Mascot'
import { BudgetSetupSheet } from '@/components/overview/BudgetSetupSheet'
import { useMonth, useExpenses, useDebts, useStatus, useDebtStrategy } from '@/hooks/use-finance-data'
import { computeInsight } from '@/lib/insight'
import { STATUS_META } from '@/lib/status'
import { formatMoney, formatMoneyCompact, formatMonthYear, formatPercent } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Обзор по спеке §3: одна цифра-ответ сверху, детали ниже, один вывод за раз.
 *
 * Что изменено против предыдущей вёрстки (см. скриншот):
 *  1. Статус-баннер больше не отдельная плашка сверху. Он отжимал главную
 *     цифру на второй экран и спорил с инсайт-карточкой — два вывода рядом.
 *     Теперь статус — точка + подпись в служебной строке, а его headline
 *     подхватывает инсайт-карточка, если своего инсайта нет.
 *  2. Полосы категорий считаются от потраченного, а не от лимита месяца —
 *     иначе все, кроме первой, были нулевыми (см. lib/month.ts).
 *  3. Снизу появилась строка «Свобода от долгов» — вторая главная цифра
 *     продукта. Без неё экран заканчивался на середине и низ пустовал.
 *  4. Кнопки загрузки — с иконками и подписями, как единственная пара
 *     действий экрана.
 */
export function Overview() {
  const navigate = useNavigate()
  const month = useMonth()
  const { data: expenses } = useExpenses()
  const { data: debts } = useDebts()
  const { data: status } = useStatus()
  const [setupOpen, setSetupOpen] = useState(false)

  const activeDebts = (debts ?? []).filter((d) => d.status === 'active')
  const { data: plan } = useDebtStrategy('avalanche', 0)

  if (!month) {
    return (
      <div className="space-y-3.5 pb-6">
        <div className="h-28 animate-pulse rounded-[18px] bg-hf-card" />
        <div className="h-44 animate-pulse rounded-[18px] bg-hf-card" />
      </div>
    )
  }

  const hasAnyExpense = (expenses?.length ?? 0) > 0
  const ownInsight = expenses && debts ? computeInsight(month.categories, debts, expenses.filter((e) => e.is_confirmed)) : null
  const statusMeta = status ? STATUS_META[status.status] : null

  // Один вывод за раз: свой детерминированный инсайт важнее недельной оценки,
  // потому что он привязан к конкретному действию.
  const insight = ownInsight ?? (status ? { text: status.headline, action: { label: 'Разобрать', to: '/receipt' } } : null)
  const insightFace = ownInsight || (status && status.score < 60) ? 'alert' : 'calm'

  if (!hasAnyExpense) {
    return (
      <div className="space-y-3.5 pb-6">
        <EmptyState onUpload={() => navigate('/receipt?add=receipt')} />
      </div>
    )
  }

  return (
    <div className="space-y-4 pb-6">
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <Eyebrow>
            {month.label} · осталось {month.daysLeft} дн
          </Eyebrow>
          {statusMeta && status && (
            <span className="flex items-center gap-1.5">
              <span className={cn('h-1.5 w-1.5 rounded-full', statusMeta.dot)} />
              <span className={cn('font-mono text-[11px]', statusMeta.text)}>{status.score}/100</span>
            </span>
          )}
        </div>

        {month.hasIncome ? (
          <>
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <span
                className={cn(
                  'text-[34px] leading-none font-bold tracking-[-0.03em]',
                  month.available >= 0 ? 'text-hf-text' : 'text-hf-warn-on-dark',
                )}
              >
                {formatMoneyCompact(month.available)}
              </span>
              <span className="font-mono text-xs text-hf-ok">в плане</span>
            </div>
            <p className="text-[13px] leading-snug text-hf-text-3">
              Можно тратить {formatMoney(month.perDay)} в день и уложиться в бюджет.
            </p>
            <div className="flex h-3 overflow-hidden rounded-md bg-hf-card">
              <div className="h-full bg-hf-accent" style={{ width: Math.min(100, (month.spent / (month.limit || 1)) * 100) + '%' }} />
              <div className="h-full bg-[#2A5A85]" style={{ width: Math.min(100, (month.pending / (month.limit || 1)) * 100) + '%' }} />
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setSetupOpen(true)}
            className="flex w-full items-center justify-between gap-3 rounded-[16px] bg-hf-card px-3.5 py-3 text-left"
          >
            <span className="min-w-0">
              <span className="block text-[13px] font-medium text-hf-text">Укажи доход — посчитаю, сколько можно тратить</span>
              <span className="block text-[11px] text-hf-text-4">Пока показываю только факты, без прогноза</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-hf-text-4" />
          </button>
        )}
      </section>

      {month.categories.length > 0 && (
        <Paper className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-2.5">
            <span className="text-sm font-medium">На что ушли деньги</span>
            <span className="font-mono text-[11px] text-hf-ink-soft">{formatMoney(month.spent)}</span>
          </div>
          {month.categories.map((c) => (
            <div key={c.id} className="flex flex-col gap-1.5">
              <div className="flex justify-between gap-2.5 text-[13px]">
                <span className="min-w-0 truncate">{c.name}</span>
                <span className="flex shrink-0 items-baseline gap-2">
                  <span className="font-mono text-[11px] text-hf-ink-soft">{formatPercent(c.pct / 100)}</span>
                  <span className={cn('font-mono', c.tone === 'warn' ? 'text-hf-warn-ink' : 'text-hf-ink')}>{formatMoney(c.amount)}</span>
                </span>
              </div>
              <ProgressBar pct={c.pct} tone={c.tone} onPaper />
            </div>
          ))}
        </Paper>
      )}

      {insight && (
        <div className="flex items-start gap-3 rounded-[18px] bg-hf-card p-3.5">
          <MascotAvatar size={34} expression={insightFace} />
          <div className="flex min-w-0 flex-col gap-2.5">
            <p className="text-[13px] leading-snug text-hf-text-2">{insight.text}</p>
            <button
              type="button"
              onClick={() => navigate(insight.action.to)}
              className="self-start text-[13px] font-medium text-hf-accent-on-dark"
            >
              {insight.action.label} →
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-2.5">
        <button
          type="button"
          onClick={() => navigate('/receipt?add=receipt')}
          className="flex flex-1 flex-col items-center gap-1.5 rounded-[14px] bg-hf-accent py-3.5 text-white"
        >
          <Camera className="h-[18px] w-[18px]" />
          <span className="text-[13px] font-medium">Загрузить чек</span>
        </button>
        <button
          type="button"
          onClick={() => navigate('/receipt')}
          className="flex flex-1 flex-col items-center gap-1.5 rounded-[14px] bg-hf-card py-3.5 text-hf-text-2"
        >
          <FileText className="h-[18px] w-[18px]" />
          <span className="text-[13px]">Выписка PDF</span>
        </button>
      </div>

      {activeDebts.length > 0 && (
        <button
          type="button"
          onClick={() => navigate('/debts')}
          className="flex w-full items-center justify-between gap-3 rounded-[16px] bg-hf-card px-3.5 py-3 text-left"
        >
          <span className="min-w-0">
            <span className="block font-mono text-[11px] tracking-[0.1em] text-hf-text-4 uppercase">Свобода от долгов</span>
            <span className="mt-1 block text-[15px] font-medium text-hf-text">
              {plan ? formatMonthYear(plan.estimated_payoff_date) : 'считаю…'}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <span className="font-mono text-[11px] text-hf-text-4">
              {formatMoneyCompact(activeDebts.reduce((s, d) => s + d.current_balance, 0))}
            </span>
            <ChevronRight className="h-4 w-4 text-hf-text-4" />
          </span>
        </button>
      )}

      <button
        type="button"
        onClick={() => setSetupOpen(true)}
        className="w-full pt-1 text-center text-[11px] text-hf-text-4"
      >
        Доход, день зарплаты и напоминания
      </button>

      <BudgetSetupSheet open={setupOpen} onOpenChange={setSetupOpen} />
    </div>
  )
}

function EmptyState({ onUpload }: { onUpload: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-[20px] bg-hf-card px-5 py-8 text-center">
      <div className="h-[130px] w-[104px]">
        <Mascot expression="calm" />
      </div>
      <div className="space-y-1.5">
        <p className="text-[15px] font-medium text-hf-text">Пока нет ни одного чека</p>
        <p className="text-[13px] leading-relaxed text-hf-text-3">Загрузи первый — и здесь появится цифра, сколько можно тратить.</p>
      </div>
      <button type="button" onClick={onUpload} className="rounded-[14px] bg-hf-accent px-6 py-3 text-sm font-medium text-white">
        Загрузить чек
      </button>
    </div>
  )
}
