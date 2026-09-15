import { useNavigate } from 'react-router-dom'
import { Eyebrow } from '@/components/chrome/Chrome'
import { Paper } from '@/components/chrome/Paper'
import { ProgressBar } from '@/components/chrome/ProgressBar'
import { MascotAvatar, Mascot } from '@/components/Mascot'
import { StatusBanner } from '@/components/status/StatusBanner'
import { useMonth, useExpenses, useDebts } from '@/hooks/use-finance-data'
import { computeInsight } from '@/lib/insight'
import { formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Обзор — одна цифра-ответ ("сколько можно тратить"), а не набор графиков
 * (ТЗ FUNCTIONAL.md §3). Пустое состояние (ни одного чека, доход не задан)
 * показывает приглашение вместо нулей — см. HasNoData ниже.
 */
export function Overview() {
  const navigate = useNavigate()
  const month = useMonth()
  const { data: expenses } = useExpenses()
  const { data: debts } = useDebts()

  if (!month) {
    return (
      <div className="space-y-3.5 pb-6">
        <div className="h-24 animate-pulse rounded-2xl bg-hf-card" />
        <div className="h-40 animate-pulse rounded-2xl bg-hf-card" />
      </div>
    )
  }

  const hasAnyExpense = (expenses?.length ?? 0) > 0
  const insight = expenses && debts ? computeInsight(month.categories, debts, expenses.filter((e) => e.is_confirmed)) : null

  return (
    <div className="space-y-3.5 pb-6">
      <StatusBanner />

      {!hasAnyExpense ? (
        <EmptyState onUpload={() => navigate('/receipt?add=receipt')} />
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <Eyebrow>
              {month.label} · осталось {month.daysLeft} дн.
            </Eyebrow>
            {month.hasIncome ? (
              <>
                <div className="flex items-baseline gap-2.5">
                  <span className={cn('text-[34px] font-bold tracking-[-0.03em]', month.available >= 0 ? 'text-hf-text' : 'text-hf-warn-on-dark')}>
                    {formatMoney(month.available)}
                  </span>
                  <span className="font-mono text-xs text-hf-ok">свободно</span>
                </div>
                <p className="text-[13px] leading-snug text-hf-text-3">
                  Можно тратить {formatMoney(month.perDay)} в день и уложиться в бюджет.
                </p>
              </>
            ) : (
              <p className="text-[13px] leading-snug text-hf-text-3">
                Доход не указан — показываю только факты, без «сколько можно тратить». Укажи его в профиле (аватар сверху).
              </p>
            )}
          </div>

          {month.hasIncome && (
            <div className="flex h-3 overflow-hidden rounded-md bg-hf-card">
              <div className="h-full bg-hf-accent" style={{ width: Math.min(100, (month.spent / (month.limit || 1)) * 100) + '%' }} />
              <div className="h-full bg-[#2A5A85]" style={{ width: Math.min(100, (month.pending / (month.limit || 1)) * 100) + '%' }} />
            </div>
          )}

          {month.categories.length > 0 && (
            <Paper className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-2.5">
                <span className="text-sm font-medium">По категориям</span>
                {month.hasIncome && <span className="font-mono text-[11px] text-hf-ink-soft">из {formatMoney(month.limit)}</span>}
              </div>
              {month.categories.map((c) => (
                <div key={c.id} className="flex flex-col gap-1.5">
                  <div className="flex justify-between gap-2.5 text-[13px]">
                    <span>{c.name}</span>
                    <span className={cn('font-mono', c.tone === 'warn' ? 'text-hf-warn-ink' : 'text-hf-ink-soft')}>{formatMoney(c.amount)}</span>
                  </div>
                  <ProgressBar pct={c.pct} tone={c.tone} onPaper />
                </div>
              ))}
            </Paper>
          )}

          {insight && (
            <div className="flex items-start gap-3 rounded-[18px] bg-hf-card p-3.5">
              <MascotAvatar size={34} expression="alert" />
              <div className="flex min-w-0 flex-col gap-2.5">
                <p className="text-[13px] leading-snug text-hf-text-2">{insight.text}</p>
                <button type="button" onClick={() => navigate(insight.action.to)} className="self-start text-[13px] font-medium text-hf-accent-on-dark">
                  {insight.action.label} {'→'}
                </button>
              </div>
            </div>
          )}

          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => navigate('/receipt?add=receipt')}
              className="flex-1 rounded-[14px] bg-hf-accent py-3.5 text-sm font-medium text-white"
            >
              Загрузить чек
            </button>
            <button type="button" onClick={() => navigate('/receipt')} className="flex-1 rounded-[14px] bg-hf-card py-3.5 text-sm text-hf-text-2">
              Выписка PDF
            </button>
          </div>
        </>
      )}
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
