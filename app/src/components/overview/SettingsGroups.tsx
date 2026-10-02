import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { ChevronRight } from 'lucide-react'
import { FormSheet, FormField, Segmented, formInputClass } from '@/components/chrome/FormSheet'
import { ToggleVisual } from '@/components/chrome/Toggle'
import { ProposedSettingsCard } from '@/components/chat/ProposedSettingsCard'
import { useBudgetInput, useHouseholdSettings, useMonth, useUpdateHouseholdSettings, useUpdateUser } from '@/hooks/use-finance-data'
import { useCurrentUser } from '@/lib/auth'
import { formatMoney, formatMoneyCompact } from '@/lib/format'
import { STRATEGY_META } from '@/lib/plan-text'
import { previewSettingsChange } from '@/lib/settings-preview'
import { cn } from '@/lib/utils'
import type { BotTone, DebtStrategyKind, HouseholdSettings } from '@/types/domain'

type SheetKey = 'period' | 'strategy' | 'windfall' | 'pause' | 'tone'

const TONES: Array<{ id: BotTone; label: string; sample: string }> = [
  { id: 'soft', label: 'Мягкий', sample: 'Если будет минутка — закинь чеки за сегодня.' },
  { id: 'neutral', label: 'Нейтральный', sample: 'Закинь чеки за сегодня.' },
  { id: 'direct', label: 'Прямой', sample: 'Чеки за сегодня.' },
]

const STRATEGIES: DebtStrategyKind[] = ['avalanche', 'snowball', 'cash_flow']

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
      </Group>

      <PeriodSheet open={open === 'period'} onClose={() => setOpen(null)} settings={settings} />
      <StrategySheet open={open === 'strategy'} onClose={() => setOpen(null)} settings={settings} />
      <WindfallSheet open={open === 'windfall'} onClose={() => setOpen(null)} settings={settings} />
      <PauseSheet open={open === 'pause'} onClose={() => setOpen(null)} settings={settings} />
      <ToneSheet open={open === 'tone'} onClose={() => setOpen(null)} current={tone.id} />
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
