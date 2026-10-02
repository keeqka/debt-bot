import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { ChevronRight } from 'lucide-react'
import { FormSheet, FormField, Segmented, formInputClass } from '@/components/chrome/FormSheet'
import { ToggleVisual } from '@/components/chrome/Toggle'
import { ProposedSettingsCard } from '@/components/chat/ProposedSettingsCard'
import { useBudgetInput, useCategories, useHouseholdSettings, useMonth, useSetCategoryNeedKind, useUpdateHouseholdSettings, useUpdateUser } from '@/hooks/use-finance-data'
import { MODEL_META, assessMonth } from '@/lib/budget-model'
import { features } from '@/lib/env'
import { useCurrentUser } from '@/lib/auth'
import { formatMoney, formatMoneyCompact } from '@/lib/format'
import { STRATEGY_META } from '@/lib/plan-text'
import { previewSettingsChange } from '@/lib/settings-preview'
import { cn } from '@/lib/utils'
import { GLOSSARY, type TermId } from '@/lib/glossary'
import { useOpenTerm } from '@/components/glossary/Term'
import type { ExplainLevel, BotTone, BudgetModel, DebtStrategyKind, ForecastMode, HouseholdSettings } from '@/types/domain'

type SheetKey = 'period' | 'model' | 'forecast' | 'strategy' | 'windfall' | 'pause' | 'tone' | 'explain' | 'review'

const TONES: Array<{ id: BotTone; label: string; sample: string }> = [
  { id: 'soft', label: 'Мягкий', sample: 'Если будет минутка — закинь чеки за сегодня.' },
  { id: 'neutral', label: 'Нейтральный', sample: 'Закинь чеки за сегодня.' },
  { id: 'direct', label: 'Прямой', sample: 'Чеки за сегодня.' },
]

const EXPLAIN_LEVELS: Array<{ id: ExplainLevel; label: string; hint: string }> = [
  { id: 'simple', label: 'Просто', hint: 'Одно-два предложения, без цифр.' },
  { id: 'numbers', label: 'С цифрами', hint: 'Объяснение и пример на твоих цифрах.' },
  { id: 'detailed', label: 'Подробно', hint: 'Пример и как это считается.' },
]

const WEEKDAYS = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота']

const STRATEGIES: DebtStrategyKind[] = ['avalanche', 'snowball', 'cash_flow']

const FORECAST_LABEL: Record<ForecastMode, string> = { cautious: 'осторожный', normal: 'обычный', optimistic: 'оптимист' }
const MODELS: BudgetModel[] = ['50_30_20', 'zero_based', 'pay_yourself_first']

/**
 * Настройки тремя группами (12): Бюджет, Долги, Чек. Каждая строка показывает
 * текущее значение и открывает свой лист. Всё сохраняется сразу и оптимистично;
 * то, что двигает план (расчётный месяц, стратегия), сначала показывает «было →
 * станет» карточкой ProposedSettingsCard и применяется кнопкой.
 */
export function SettingsGroups() {
  const { data: settings } = useHouseholdSettings()
  const user = useCurrentUser()
  const [open, setOpen] = useState<SheetKey | null>(null)

  if (!settings) return null
  const tone = TONES.find((t) => t.id === user.bot_tone) ?? TONES[1]

  return (
    <div className="space-y-5 border-t border-hf-line pt-4">
      <Group title="Бюджет">
        <Row label="Расчётный месяц" value={settings.period_start_day == null ? 'календарный' : `с ${settings.period_start_day}-го числа`} onClick={() => setOpen('period')} />
        {features.budgetModel && <Row label="Модель оценки" value={MODEL_META[settings.budget_model].label} onClick={() => setOpen('model')} />}
        {features.forecast && <Row label="Прогноз" value={FORECAST_LABEL[settings.forecast_mode]} onClick={() => setOpen('forecast')} />}
      </Group>
      <Group title="Долги">
        <Row label="Стратегия" value={STRATEGY_META[settings.debt_strategy].label} onClick={() => setOpen('strategy')} />
        <Row label="Найденные деньги в долг" value={settings.windfall_to_debt_pct > 0 ? `${settings.windfall_to_debt_pct}%` : 'выключено'} onClick={() => setOpen('windfall')} />
        <Row
          label="Пауза перед покупкой"
          value={settings.pause_threshold == null ? 'выключена' : `дороже ${formatMoneyCompact(settings.pause_threshold)} · ${settings.pause_hours} ч`}
          onClick={() => setOpen('pause')}
        />
      </Group>
      <Group title="Чек">
        <Row label="Тон" value={tone.label} onClick={() => setOpen('tone')} />
        {features.glossary && <Row label="Глубина объяснений" value={(EXPLAIN_LEVELS.find((l) => l.id === user.explain_level) ?? EXPLAIN_LEVELS[1]).label.toLowerCase()} onClick={() => setOpen('explain')} />}
        {features.weeklyReview && <Row label="День разбора недели" value={WEEKDAYS[user.weekly_review_dow] ?? WEEKDAYS[0]} onClick={() => setOpen('review')} />}
      </Group>

      <PeriodSheet open={open === 'period'} onClose={() => setOpen(null)} settings={settings} />
      <ModelSheet open={open === 'model'} onClose={() => setOpen(null)} settings={settings} />
      <ForecastModeSheet open={open === 'forecast'} onClose={() => setOpen(null)} settings={settings} />
      <StrategySheet open={open === 'strategy'} onClose={() => setOpen(null)} settings={settings} />
      <WindfallSheet open={open === 'windfall'} onClose={() => setOpen(null)} settings={settings} />
      <PauseSheet open={open === 'pause'} onClose={() => setOpen(null)} settings={settings} />
      <ToneSheet open={open === 'tone'} onClose={() => setOpen(null)} current={tone.id} />
      <ExplainSheet open={open === 'explain'} onClose={() => setOpen(null)} />
      <ReviewDaySheet open={open === 'review'} onClose={() => setOpen(null)} />
    </div>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="font-mono text-[11px] tracking-[0.1em] text-hf-text-4 uppercase">{title}</p>
      <div className="divide-y divide-hf-line overflow-hidden rounded-[16px] bg-hf-card">{children}</div>
    </div>
  )
}

function Row({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-hf-accent"
    >
      <span className="min-w-0 text-[13px] text-hf-text">{label}</span>
      <span className="flex min-w-0 shrink items-center gap-1.5">
        <span className="truncate font-mono text-[11px] text-hf-text-4">{value}</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-hf-text-4" />
      </span>
    </button>
  )
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" onClick={onClose} className="min-h-11 w-full rounded-[13px] bg-hf-card py-3 text-[15px] text-hf-text-2">
      Готово
    </button>
  )
}

/** Карточка «было → станет» для настроек, которые двигают план; применяется её кнопкой. */
function PlanPreview({ change, onApply, pending }: { change: Partial<HouseholdSettings>; onApply: () => void; pending: boolean }) {
  const input = useBudgetInput()
  if (!input) return null
  return <ProposedSettingsCard inline proposal={previewSettingsChange(input, change)} applied={false} pending={pending} onApply={onApply} />
}

// ── Расчётный месяц ─────────────────────────────────────────────────────

function PeriodSheet({ open, onClose, settings }: { open: boolean; onClose: () => void; settings: HouseholdSettings }) {
  const update = useUpdateHouseholdSettings()
  const user = useCurrentUser()
  const [fromPayday, setFromPayday] = useState(settings.period_start_day != null)
  const [day, setDay] = useState(String(settings.period_start_day ?? user.payday ?? 1))

  // Открыли заново — снова от сохранённых значений, а не от недокрученного черновика.
  useEffect(() => {
    if (!open) return
    setFromPayday(settings.period_start_day != null)
    setDay(String(settings.period_start_day ?? user.payday ?? 1))
  }, [open, settings.period_start_day, user.payday])

  const dayNum = Math.min(31, Math.max(1, Math.round(Number(day)) || 1))
  const target: number | null = fromPayday ? dayNum : null
  const changed = target !== settings.period_start_day

  return (
    <FormSheet open={open} onOpenChange={(o) => !o && onClose()} title="Расчётный месяц" footer={<CloseButton onClose={onClose} />}>
      <p className="text-[12px] leading-relaxed text-hf-text-3">От этого зависят «сколько можно тратить в день» и что считается обычными тратами.</p>
      <Segmented
        value={fromPayday ? 'payday' : 'calendar'}
        onChange={(v) => setFromPayday(v === 'payday')}
        options={[
          { value: 'calendar', label: 'Календарный' },
          { value: 'payday', label: 'От зарплаты' },
        ]}
      />
      {fromPayday && (
        <FormField label="Месяц начинается с числа (1–31)">
          <input type="number" inputMode="numeric" min={1} max={31} value={day} onChange={(e) => setDay(e.target.value)} className={formInputClass} />
        </FormField>
      )}
      {changed && (
        <PlanPreview
          change={{ period_start_day: target }}
          pending={update.isPending}
          onApply={() => {
            update.mutate({ period_start_day: target })
            toast.success('Расчётный месяц обновлён')
            onClose()
          }}
        />
      )}
    </FormSheet>
  )
}

// ── Стратегия ───────────────────────────────────────────────────────────

function StrategySheet({ open, onClose, settings }: { open: boolean; onClose: () => void; settings: HouseholdSettings }) {
  const update = useUpdateHouseholdSettings()
  const [picked, setPicked] = useState<DebtStrategyKind>(settings.debt_strategy)
  const activeDebts = useMonth()?.plan.hasDebts
  useEffect(() => {
    if (open) setPicked(settings.debt_strategy)
  }, [open, settings.debt_strategy])

  return (
    <FormSheet open={open} onOpenChange={(o) => !o && onClose()} title="Стратегия погашения" footer={<CloseButton onClose={onClose} />}>
      <div className="space-y-2" role="radiogroup" aria-label="Стратегия погашения">
        {STRATEGIES.map((st) => (
          <button
            key={st}
            type="button"
            role="radio"
            aria-checked={picked === st}
            onClick={() => setPicked(st)}
            className={cn(
              'min-h-11 w-full rounded-[12px] border px-3.5 py-2.5 text-left',
              picked === st ? 'border-hf-accent bg-hf-card' : 'border-transparent bg-hf-card',
            )}
          >
            <span className="block text-[13px] font-medium text-hf-text">{STRATEGY_META[st].label}</span>
            <span className="mt-0.5 block text-[11px] leading-snug text-hf-text-4">{STRATEGY_META[st].why}</span>
          </button>
        ))}
      </div>
      {picked !== settings.debt_strategy && activeDebts && (
        <PlanPreview
          change={{ debt_strategy: picked }}
          pending={update.isPending}
          onApply={() => {
            update.mutate({ debt_strategy: picked })
            toast.success(`Стратегия: ${STRATEGY_META[picked].label}`)
            onClose()
          }}
        />
      )}
      {picked !== settings.debt_strategy && !activeDebts && (
        <button
          type="button"
          onClick={() => {
            update.mutate({ debt_strategy: picked })
            onClose()
          }}
          className="min-h-11 w-full rounded-[13px] bg-hf-accent py-3 text-[15px] font-medium text-white"
        >
          Выбрать
        </button>
      )}
    </FormSheet>
  )
}

// ── Найденные деньги в долг ─────────────────────────────────────────────

const WINDFALL_STEPS = [0, 10, 20, 30, 50, 100]

function WindfallSheet({ open, onClose, settings }: { open: boolean; onClose: () => void; settings: HouseholdSettings }) {
  const update = useUpdateHouseholdSettings()
  return (
    <FormSheet open={open} onOpenChange={(o) => !o && onClose()} title="Найденные деньги в долг" footer={<CloseButton onClose={onClose} />}>
      <p className="text-[12px] leading-relaxed text-hf-text-3">
        Когда записываешь разовый доход (премия, подарок, возврат), я предложу отправить эту долю в долг — сам ничего не спишу.
      </p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Доля разового дохода в долг">
        {WINDFALL_STEPS.map((pct) => (
          <button
            key={pct}
            type="button"
            role="radio"
            aria-checked={settings.windfall_to_debt_pct === pct}
            onClick={() => update.mutate({ windfall_to_debt_pct: pct })}
            className={cn(
              'min-h-11 min-w-14 rounded-[10px] px-3.5 py-2 text-[13px]',
              settings.windfall_to_debt_pct === pct ? 'bg-hf-accent font-medium text-white' : 'bg-hf-card text-hf-text-3',
            )}
          >
            {pct === 0 ? 'Выкл' : `${pct}%`}
          </button>
        ))}
      </div>
    </FormSheet>
  )
}

// ── Пауза перед покупкой ────────────────────────────────────────────────

function PauseSheet({ open, onClose, settings }: { open: boolean; onClose: () => void; settings: HouseholdSettings }) {
  const update = useUpdateHouseholdSettings()
  const month = useMonth()
  const enabled = settings.pause_threshold != null
  const [draft, setDraft] = useState(String(settings.pause_threshold ?? ''))
  useEffect(() => {
    if (open) setDraft(String(settings.pause_threshold ?? ''))
  }, [open, settings.pause_threshold])

  function enable() {
    const suggested = Math.max(10_000, Math.round(((month?.income ?? 0) * 0.1) / 1000) * 1000) || 50_000
    setDraft(String(suggested))
    update.mutate({ pause_threshold: suggested })
  }

  function saveThreshold() {
    const n = Number(draft)
    if (!draft.trim() || !Number.isFinite(n) || n <= 0) return setDraft(String(settings.pause_threshold ?? ''))
    if (n !== settings.pause_threshold) update.mutate({ pause_threshold: Math.round(n) })
  }

  return (
    <FormSheet open={open} onOpenChange={(o) => !o && onClose()} title="Пауза перед покупкой" footer={<CloseButton onClose={onClose} />}>
      <p className="text-[12px] leading-relaxed text-hf-text-3">
        Если новый долг или рассрочка дороже порога, главной кнопкой станет «Напомнить через N ч»: решить можно позже и на холодную голову.
      </p>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={() => (enabled ? update.mutate({ pause_threshold: null }) : enable())}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-[14px] bg-hf-card px-3.5 py-2.5 text-left"
      >
        <span className="text-[13px] text-hf-text">Включить паузу</span>
        <ToggleVisual checked={enabled} />
      </button>
      {enabled && (
        <>
          <FormField label={`Порог, ₸ (сейчас ${formatMoney(settings.pause_threshold ?? 0)})`}>
            <input type="number" inputMode="numeric" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={saveThreshold} className={formInputClass} />
          </FormField>
          <Segmented
            value={String(settings.pause_hours) as '24' | '72'}
            onChange={(v) => update.mutate({ pause_hours: Number(v) as 24 | 72 })}
            options={[
              { value: '24', label: '24 часа' },
              { value: '72', label: '72 часа' },
            ]}
          />
        </>
      )}
    </FormSheet>
  )
}

// ── Тон бота ────────────────────────────────────────────────────────────

function ToneSheet({ open, onClose, current }: { open: boolean; onClose: () => void; current: BotTone }) {
  const updateUser = useUpdateUser()
  const user = useCurrentUser()
  return (
    <FormSheet open={open} onOpenChange={(o) => !o && onClose()} title="Тон «Чека»" footer={<CloseButton onClose={onClose} />}>
      <p className="text-[12px] leading-relaxed text-hf-text-3">Так бот говорит в чате и в напоминаниях. Характер тот же, меняется подача.</p>
      <div className="space-y-2" role="radiogroup" aria-label="Тон бота">
        {TONES.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={current === t.id}
            onClick={() => updateUser.mutate({ id: user.id, patch: { bot_tone: t.id } })}
            className={cn(
              'min-h-11 w-full rounded-[12px] border px-3.5 py-2.5 text-left',
              current === t.id ? 'border-hf-accent bg-hf-card' : 'border-transparent bg-hf-card',
            )}
          >
            <span className="block text-[13px] font-medium text-hf-text">{t.label}</span>
            <span className="mt-0.5 block text-[12px] leading-snug text-hf-text-3">«{t.sample}»</span>
          </button>
        ))}
      </div>
    </FormSheet>
  )
}

// ── Глубина объяснений и словарь ───────────────────────────────────────

function ExplainSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const updateUser = useUpdateUser()
  const user = useCurrentUser()
  const openTerm = useOpenTerm()
  return (
    <FormSheet open={open} onOpenChange={(o) => !o && onClose()} title="Глубина объяснений" footer={<CloseButton onClose={onClose} />}>
      <p className="text-[12px] leading-relaxed text-hf-text-3">Как «Чек» объясняет термины — «ГЭСВ», «сложный процент», «минимальный платёж». Тап по слову с пунктиром открывает объяснение.</p>
      <div className="space-y-2" role="radiogroup" aria-label="Глубина объяснений">
        {EXPLAIN_LEVELS.map((l) => (
          <button
            key={l.id}
            type="button"
            role="radio"
            aria-checked={user.explain_level === l.id}
            onClick={() => updateUser.mutate({ id: user.id, patch: { explain_level: l.id } })}
            className={cn('min-h-11 w-full rounded-[12px] border px-3.5 py-2.5 text-left', user.explain_level === l.id ? 'border-hf-accent bg-hf-card' : 'border-transparent bg-hf-card')}
          >
            <span className="block text-[13px] font-medium text-hf-text">{l.label}</span>
            <span className="mt-0.5 block text-[12px] leading-snug text-hf-text-3">{l.hint}</span>
          </button>
        ))}
      </div>
      <p className="pt-1 font-mono text-[11px] tracking-[0.1em] text-hf-text-4 uppercase">Словарь</p>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(GLOSSARY) as TermId[]).map((id) => (
          <button key={id} type="button" onClick={() => openTerm(id)} className="min-h-11 rounded-[12px] bg-hf-card px-3.5 text-[13px] text-hf-text-2">
            {GLOSSARY[id].title}
          </button>
        ))}
      </div>
    </FormSheet>
  )
}

// ── День разбора недели ────────────────────────────────────────────────

function ReviewDaySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const updateUser = useUpdateUser()
  const user = useCurrentUser()
  // Неделя в России и Казахстане начинается с понедельника: порядок Пн…Вс, значения 1…6, 0.
  const order = [1, 2, 3, 4, 5, 6, 0]
  return (
    <FormSheet open={open} onOpenChange={(o) => !o && onClose()} title="День разбора недели" footer={<CloseButton onClose={onClose} />}>
      <p className="text-[12px] leading-relaxed text-hf-text-3">В этот день в 19:00 по Алматы «Чек» пришлёт разбор недели: что случилось с тратами и один шаг на следующую.</p>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="День разбора недели">
        {order.map((d) => (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={user.weekly_review_dow === d}
            onClick={() => updateUser.mutate({ id: user.id, patch: { weekly_review_dow: d } })}
            className={cn('min-h-11 rounded-[12px] border px-3.5 text-[13px]', user.weekly_review_dow === d ? 'border-hf-accent bg-hf-card text-hf-text' : 'border-transparent bg-hf-card text-hf-text-3')}
          >
            {WEEKDAYS[d]}
          </button>
        ))}
      </div>
    </FormSheet>
  )
}

// ── Прогноз ─────────────────────────────────────────────────────────────

function ForecastModeSheet({ open, onClose, settings }: { open: boolean; onClose: () => void; settings: HouseholdSettings }) {
  const update = useUpdateHouseholdSettings()
  const HINT: Record<ForecastMode, string> = {
    cautious: 'Остаток месяца — по самой дорогой неделе. Прогноз с запасом.',
    normal: 'Остаток месяца — по среднему темпу трат.',
    optimistic: 'Остаток месяца — по обычному дню, без редких крупных трат.',
  }
  return (
    <FormSheet open={open} onOpenChange={(o) => !o && onClose()} title="Прогноз до конца месяца" footer={<CloseButton onClose={onClose} />}>
      <p className="text-[12px] leading-relaxed text-hf-text-3">Так считается прогноз при тапе на главную цифру «Обзора». Регулярные платежи учитываются по датам при любом режиме.</p>
      <Segmented
        value={settings.forecast_mode}
        onChange={(v) => update.mutate({ forecast_mode: v })}
        options={[
          { value: 'cautious', label: 'Осторожный' },
          { value: 'normal', label: 'Обычный' },
          { value: 'optimistic', label: 'Оптимист' },
        ]}
      />
      <p className="text-[12px] text-hf-text-4">{HINT[settings.forecast_mode]}</p>
    </FormSheet>
  )
}

// ── Модель оценки ───────────────────────────────────────────────────────

function ModelSheet({ open, onClose, settings }: { open: boolean; onClose: () => void; settings: HouseholdSettings }) {
  const update = useUpdateHouseholdSettings()
  const input = useBudgetInput()
  const { data: categories } = useCategories()
  const setKind = useSetCategoryNeedKind()
  const a = input && open ? assessMonth(input, settings.budget_model) : null
  // Пользовательские расходные категории без пометки «нужное / желание» — спрашиваем один раз.
  const unmarked = (categories ?? []).filter((c) => c.type === 'expense' && !c.is_system && !c.need_kind)

  return (
    <FormSheet open={open} onOpenChange={(o) => !o && onClose()} title="Модель оценки" footer={<CloseButton onClose={onClose} />}>
      <p className="text-[12px] leading-relaxed text-hf-text-3">Модель решает, как оценивается месяц и статус. Цифру «можно тратить в день» она не меняет.</p>
      <div className="space-y-2" role="radiogroup" aria-label="Модель оценки">
        {MODELS.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={settings.budget_model === m}
            onClick={() => update.mutate({ budget_model: m })}
            className={cn('min-h-11 w-full rounded-[12px] border px-3.5 py-2.5 text-left', settings.budget_model === m ? 'border-hf-accent bg-hf-card' : 'border-transparent bg-hf-card')}
          >
            <span className="block text-[13px] font-medium text-hf-text">{MODEL_META[m].label}</span>
            <span className="mt-0.5 block text-[11px] leading-snug text-hf-text-4">{MODEL_META[m].description}</span>
          </button>
        ))}
      </div>

      {a && (
        <div className="space-y-2 rounded-[16px] bg-hf-receipt p-3.5 text-hf-ink">
          <p className="text-[13px] leading-snug font-medium">{a.headline}</p>
          {a.rows.map((r) => (
            <div key={r.label} className="flex items-baseline justify-between gap-2 text-[12px]">
              <span className="min-w-0">{r.label}</span>
              <span className={cn('shrink-0 font-mono', r.state === 'warn' ? 'text-hf-warn-ink' : r.state === 'ok' ? 'text-hf-accent-ink' : '')}>
                {r.value}
                {r.target ? <span className="ml-1.5 text-[10px] text-hf-ink-soft">{r.target}</span> : null}
              </span>
            </div>
          ))}
          {a.freedomIndex != null && (
            <div className="border-t border-hf-receipt-line pt-2 text-[12px]">
              <div className="flex justify-between gap-2">
                <span>Индекс свободы</span>
                <span className="font-mono">{Math.round(a.freedomIndex * 100)}%</span>
              </div>
              <p className="mt-0.5 text-[11px] text-hf-ink-soft">
                Столько дохода уходит на обязательное{a.freedomMain ? `; главный вес — ${a.freedomMain}` : ''}.
              </p>
            </div>
          )}
        </div>
      )}

      {unmarked.length > 0 && (
        <div className="space-y-2">
          <p className="text-[12px] text-hf-text-3">Твои категории без пометки — это нужное или желание? Спрошу один раз.</p>
          {unmarked.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-2 rounded-[12px] bg-hf-card px-3 py-1.5">
              <span className="min-w-0 truncate text-[13px] text-hf-text">{c.name}</span>
              <span className="flex shrink-0 gap-1.5">
                {([['need', 'Нужное'], ['want', 'Желание']] as const).map(([k, label]) => (
                  <button key={k} type="button" onClick={() => setKind.mutate({ id: c.id, needKind: k })} className="min-h-11 rounded-[9px] bg-hf-bar px-3 text-[12px] text-hf-text-2">
                    {label}
                  </button>
                ))}
              </span>
            </div>
          ))}
        </div>
      )}
    </FormSheet>
  )
}
