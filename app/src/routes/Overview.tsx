import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronRight } from 'lucide-react'
import { CameraReceiptIcon, SettingsIcon } from '@/components/icons/hf'
import { Eyebrow } from '@/components/chrome/Chrome'
import { Paper } from '@/components/chrome/Paper'
import { ProgressBar } from '@/components/chrome/ProgressBar'
import { MascotAvatar, Mascot } from '@/components/Mascot'
import { BudgetSetupSheet } from '@/components/overview/BudgetSetupSheet'
import { ReportSheet } from '@/components/overview/ReportSheet'
import { ForecastSheet } from '@/components/overview/ForecastSheet'
import { HealthSheet } from '@/components/overview/HealthSheet'
import { WeeklyReviewSheet } from '@/components/overview/WeeklyReviewSheet'
import { features } from '@/lib/env'
import { SettingsRow, rowClass } from '@/components/overview/SettingsRow'
import { useMonth, useExpenses, useDebts, useGoals, useStatus, useDebtFreeDate, useHealth } from '@/hooks/use-finance-data'
import { goalsWaitUntil } from '@/lib/goal'
import { computeInsight } from '@/lib/insight'
import { STATUS_META } from '@/lib/status'
import { formatMoney, formatMoneyCompact, formatMonthYear, formatPercent } from '@/lib/format'
import { useAnimatedNumber } from '@/hooks/use-animated-number'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { useHeaderAction } from '@/lib/header-action'
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
  const [reportOpen, setReportOpen] = useState(false)
  const [forecastOpen, setForecastOpen] = useState(false)
  const [healthOpen, setHealthOpen] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  // Диплинк из сообщения бота: #/overview?review=1 открывает разбор недели; параметр убираем, чтобы повторный заход не открывал его снова.
  const [params, setParams] = useSearchParams()
  useEffect(() => {
    if (params.get('review') !== '1') return
    if (features.weeklyReview) setReviewOpen(true)
    setParams((p) => { p.delete('review'); return p }, { replace: true })
  }, [params, setParams])
  const health = useHealth()

  const activeDebts = (debts ?? []).filter((d) => d.status === 'active')
  // Same budget extra and same simulation as the Debts screen's default plan,
  // so both "Свобода от долгов" numbers are always the same date.
  const debtFreeDate = useDebtFreeDate()
  const reduced = useReducedMotion()
  // Hooks must run unconditionally, before month's own loading-state early
  // return below — 0 is a harmless placeholder until real data lands, since
  // useAnimatedNumber never animates the very first value it sees anyway.
  const animatedAvailable = useAnimatedNumber(month?.available ?? 0)

  useHeaderAction(
    <button
      type="button"
      onClick={() => setSetupOpen(true)}
      aria-label="Настройки"
      className="grid h-[30px] w-[30px] place-items-center rounded-[9px] bg-hf-card text-hf-text-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hf-accent"
    >
      <SettingsIcon className="h-4 w-4" />
    </button>,
    [],
  )

  const sheets = (
    <>
      <BudgetSetupSheet open={setupOpen} onOpenChange={setSetupOpen} />
      <ReportSheet open={reportOpen} onOpenChange={setReportOpen} />
      <ForecastSheet open={forecastOpen} onOpenChange={setForecastOpen} />
      <HealthSheet open={healthOpen} onOpenChange={setHealthOpen} />
      <WeeklyReviewSheet open={reviewOpen} onOpenChange={setReviewOpen} />
    </>
  )

  if (!month) {
    return (
      <div className="space-y-3.5 pb-6">
        <div className="h-28 animate-pulse rounded-[18px] bg-hf-card" />
        <div className="h-44 animate-pulse rounded-[18px] bg-hf-card" />
        {sheets}
      </div>
    )
  }

  const hasAnyExpense = (expenses?.length ?? 0) > 0
  const ownInsight = expenses && debts ? computeInsight(month, debts, expenses) : null
  // Про месяц целиком — перерасход в одной категории говорит инсайт, не эта подпись.
  const overspent = month.signals.some((s) => s.kind === 'pace')
  const statusMeta = status ? STATUS_META[status.status] : null

  // Один вывод за раз: свой детерминированный инсайт важнее недельной оценки,
  // потому что он привязан к конкретному действию.
  const insight = ownInsight ?? (status ? { text: status.headline, action: { label: 'Разобрать', to: '/receipt' } } : null)
  const insightFace = ownInsight || (status && status.score < 60) ? 'alert' : 'calm'

  if (!hasAnyExpense) {
    return (
      <div className="space-y-3.5 pb-6">
        <EmptyState onUpload={() => navigate('/receipt?add=receipt')} />
        {sheets}
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
            {/* Тап по главной цифре — прогноз конца месяца (02). */}
            <div
              role={features.forecast ? 'button' : undefined}
              tabIndex={features.forecast ? 0 : undefined}
              aria-label={features.forecast ? 'Прогноз до конца месяца' : undefined}
              onClick={features.forecast ? () => setForecastOpen(true) : undefined}
              onKeyDown={features.forecast ? (e) => (e.key === 'Enter' || e.key === ' ') && setForecastOpen(true) : undefined}
              className={cn('flex flex-wrap items-baseline gap-x-2.5 gap-y-1', features.forecast && 'min-h-11 cursor-pointer items-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hf-accent')}
            >
              <span
                className={cn(
                  'text-[34px] leading-none font-bold tracking-[-0.03em]',
                  animatedAvailable >= 0 ? 'text-hf-text' : 'text-hf-warn-on-dark',
                )}
              >
                {formatMoneyCompact(animatedAvailable)}
              </span>
              {month.available < 0 ? (
                <span className="font-mono text-xs text-hf-warn-on-dark">перерасход</span>
              ) : overspent ? (
                <span className="font-mono text-xs text-hf-text-4">быстрее обычного</span>
              ) : (
                <span className="font-mono text-xs text-hf-ok">в плане</span>
              )}
            </div>
            <p className="text-[13px] leading-snug text-hf-text-3">
              {month.available > 0
                ? `Можно тратить ${formatMoney(month.perDay)} в день и уложиться в бюджет.`
                : `Бюджет на траты этого месяца — ${formatMoney(month.limit)} — уже выбран.`}
            </p>
            {/* Трек от дохода: траты (синий) + деньги в долги/цели (тёмный) + остаток. */}
            <div className="flex h-3 overflow-hidden rounded-md bg-hf-card">
              <div className="h-full bg-hf-accent" style={{ width: Math.min(100, (month.spent / (month.income || 1)) * 100) + '%' }} />
              <div className="h-full bg-[#2A5A85]" style={{ width: Math.min(100, (month.obligations / (month.income || 1)) * 100) + '%' }} />
            </div>
            {month.obligations > 0 && (
              <p className="text-[11px] leading-snug text-hf-text-4">
                {planLine(month)}
                {month.historyMonths === 0 && ' Первый месяц: план по текущему темпу трат, уточнится после полного месяца.'}
              </p>
            )}
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

      <AnimatePresence mode="wait">
        {insight && (
          <motion.div
            key={insight.text}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0, transition: { duration: reduced ? 0 : 0.15 } }}
            exit={{ opacity: 0, y: -4, transition: { duration: reduced ? 0 : 0.12 } }}
            className="flex items-start gap-3 rounded-[18px] bg-hf-card p-3.5"
          >
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
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={() => navigate('/receipt?add=receipt')}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-[14px] bg-hf-accent py-3 text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hf-accent"
      >
        <CameraReceiptIcon className="h-[18px] w-[18px]" />
        <span className="text-[13px] font-medium">Загрузить чек</span>
      </button>

      <div className="flex flex-col gap-2">
        {activeDebts.length > 0 && (
          <button type="button" onClick={() => navigate('/plan')} className={rowClass}>
            <span className="min-w-0">
              <span className="block font-mono text-[11px] tracking-[0.1em] text-hf-text-4 uppercase">Свобода от долгов</span>
              <span className="mt-1 block text-[15px] font-medium text-hf-text">
                {debtFreeDate === undefined ? 'считаю…' : formatMonthYear(debtFreeDate)}
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

        <GoalsLinkRow onOpen={() => navigate('/plan?to=goals')} />

        <button type="button" onClick={() => setReportOpen(true)} className={rowClass}>
          <span className="min-w-0">
            <span className="block font-mono text-[11px] tracking-[0.1em] text-hf-text-4 uppercase">Выписка</span>
            <span className="mt-1 block text-[13px] text-hf-text">Как прошёл месяц, что поправить</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-hf-text-4" />
        </button>

        <SettingsRow onClick={() => setSetupOpen(true)} />

        {features.health && (
          <button type="button" onClick={() => setHealthOpen(true)} className={rowClass}>
            <span className="min-w-0">
              <span className="block font-mono text-[11px] tracking-[0.1em] text-hf-text-4 uppercase">
                Финансовое здоровье{health ? ` · ${health.done}/${health.total}` : ''}
              </span>
              <span className="mt-1 block text-[13px] text-hf-text">
                {health?.next ? health.next.title : health ? 'Все пункты закрыты' : 'считаю…'}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-hf-text-4" />
          </button>
        )}

        {features.weeklyReview && (
          <button type="button" onClick={() => setReviewOpen(true)} className={rowClass}>
            <span className="min-w-0">
              <span className="block font-mono text-[11px] tracking-[0.1em] text-hf-text-4 uppercase">Разбор недели</span>
              <span className="mt-1 block text-[13px] text-hf-text">Победа, поправка и челленджи</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-hf-text-4" />
          </button>
        )}
      </div>

      {sheets}
    </div>
  )
}

/** «Куда в этом месяце уходит не-трата»: долги (с учётом внесённого), подушка, цели — по плану. */
function planLine(month: NonNullable<ReturnType<typeof useMonth>>) {
  const debtsTotal = month.debtPaid + Math.max(0, month.reserved - month.plan.now.toCushion - month.plan.now.toGoals)
  const parts = [
    debtsTotal > 0 ? `${formatMoney(debtsTotal)} — в долги` : null,
    month.plan.now.toCushion > 0 ? `${formatMoney(month.plan.now.toCushion)} — в подушку` : null,
    month.plan.now.toGoals > 0 ? `${formatMoney(month.plan.now.toGoals)} — на цели` : null,
  ].filter(Boolean)
  const unpaid = month.reserved > 0 ? `, ещё не внесено ${formatMoney(month.reserved)}` : ''
  return `В этом месяце: ${parts.join(', ')}${unpaid}.`
}

/** Подушка и цели живут на вкладке «План»; здесь — одна строка, чтобы было видно, где они и как идут. */
function GoalsLinkRow({ onOpen }: { onOpen: () => void }) {
  const { data: goals } = useGoals()
  const month = useMonth()
  const active = (goals ?? []).filter((g) => g.status === 'active')
  const cushion = active.find((g) => g.is_cushion)
  const others = active.filter((g) => !g.is_cushion)
  const waitUntil = month ? goalsWaitUntil(month) : null

  const parts = [
    cushion && cushion.target_amount > 0 ? `подушка ${formatPercent(Math.min(1, cushion.current_amount / cushion.target_amount))}` : null,
    others.length ? `${others.length} ${others.length === 1 ? 'цель' : others.length < 5 ? 'цели' : 'целей'}` : null,
    others.length && waitUntil
      ? `копить с ${new Intl.DateTimeFormat('ru-RU', { month: 'short', year: 'numeric' }).format(new Date(waitUntil)).replace(' г.', '')}`
      : null,
  ].filter(Boolean)

  return (
    <button type="button" onClick={onOpen} className={rowClass}>
      <span className="min-w-0">
        <span className="block font-mono text-[11px] tracking-[0.1em] text-hf-text-4 uppercase">Подушка и цели</span>
        <span className="mt-1 block truncate text-[13px] text-hf-text">{parts.length ? parts.join(' · ') : 'Поставить первую цель'}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-hf-text-4" />
    </button>
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
