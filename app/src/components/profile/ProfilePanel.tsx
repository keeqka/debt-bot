import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, X } from 'lucide-react'
import {
  useActivateSubscription,
  useAddCategory,
  useCategories,
  useDeleteCategory,
  useReceiptScanCount,
  useSubscription,
  useUpdateUser,
} from '@/hooks/use-finance-data'
import { useCurrentUser } from '@/lib/auth'
import { isBackendConfigured } from '@/lib/env'
import { isInsideTelegram } from '@/lib/telegram'
import { formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { CategoryType } from '@/types/domain'

const FULL_TIER_FEATURES = [
  'Чеки и выписки без лимита',
  'Разбор подписок и комиссий',
  'Ежедневное напоминание загрузить чеки',
]

const FREE_TIER_LIMIT = 30

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="font-mono text-[11px] tracking-[0.1em] text-hf-text-4 uppercase">{children}</h3>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] text-hf-text-4">{label}</span>
      {children}
    </label>
  )
}

const inputClass =
  'h-9 w-full rounded-[10px] border border-hf-line bg-hf-bar px-2.5 text-[13px] text-hf-text placeholder:text-hf-text-4 focus:border-hf-accent focus:outline-none'

/**
 * Профиль — доход/дата зарплаты (от них считается «сколько можно тратить»),
 * ежедневное напоминание о чеках, тариф, категории.
 *
 * Тариф показан бумажной карточкой: это данные о пользователе, а не элемент
 * интерфейса — то же правило, что на «Обзоре» и в разборе чека.
 */
export function ProfilePanel() {
  const user = useCurrentUser()
  const { data: categories } = useCategories()
  const addCategory = useAddCategory()
  const deleteCategory = useDeleteCategory()
  const updateUser = useUpdateUser()
  const { data: subscription } = useSubscription()
  const { data: scanCount = 0 } = useReceiptScanCount()
  const activateSubscription = useActivateSubscription()

  const [income, setIncome] = useState(user.monthly_income?.toString() ?? '')
  const [payday, setPayday] = useState(user.payday?.toString() ?? '')
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryType, setNewCategoryType] = useState<CategoryType>('expense')

  useEffect(() => {
    setIncome(user.monthly_income?.toString() ?? '')
    setPayday(user.payday?.toString() ?? '')
  }, [user.id])

  function saveIncome() {
    const n = Number(income)
    updateUser.mutate(
      { id: user.id, patch: { monthly_income: income.trim() && Number.isFinite(n) ? n : null } },
      { onSuccess: () => toast.success('Доход обновлён') },
    )
  }

  function savePayday() {
    const n = Number(payday)
    const valid = payday.trim() && Number.isFinite(n) && n >= 1 && n <= 31
    updateUser.mutate({ id: user.id, patch: { payday: valid ? n : null } }, { onSuccess: () => toast.success('Дата зарплаты обновлена') })
  }

  async function handleAddCategory() {
    if (!newCategoryName.trim()) return
    await addCategory.mutateAsync({ name: newCategoryName.trim(), icon: 'tag', type: newCategoryType })
    setNewCategoryName('')
    toast.success('Категория добавлена')
  }

  async function handleDeleteCategory(id: string) {
    await deleteCategory.mutateAsync(id)
    toast.success('Категория удалена')
  }

  const isActive = subscription?.status === 'active'

  return (
    <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 pb-8">
      <section className="space-y-2">
        <SectionTitle>Подключение</SectionTitle>
        <div className="flex items-center justify-between rounded-[14px] bg-hf-card px-3.5 py-3">
          <span className="text-[13px] text-hf-text-2">Telegram</span>
          <span className={cn('font-mono text-[11px]', isInsideTelegram() ? 'text-hf-ok' : 'text-hf-text-4')}>
            {isInsideTelegram() ? 'подключено' : 'вне Telegram'}
          </span>
        </div>
        <div className="flex items-center justify-between rounded-[14px] bg-hf-card px-3.5 py-3">
          <span className="text-[13px] text-hf-text-2">Backend</span>
          <span className={cn('font-mono text-[11px]', isBackendConfigured ? 'text-hf-ok' : 'text-hf-warn-on-dark')}>
            {isBackendConfigured ? 'подключено' : 'демо-режим'}
          </span>
        </div>
      </section>

      <section className="space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <SectionTitle>Тариф</SectionTitle>
          <span className={cn('font-mono text-[11px]', isActive ? 'text-hf-accent-on-dark' : 'text-hf-text-4')}>
            {isActive ? 'полный' : 'бесплатный'}
          </span>
        </div>

        {isActive ? (
          <p className="text-[13px] leading-relaxed text-hf-text-3">
            Чеки и выписки без лимита, разбор подписок, ежедневные напоминания.
          </p>
        ) : (
          <div className="flex flex-col gap-3 rounded-[18px] bg-hf-receipt p-4 text-hf-ink">
            <div className="flex items-baseline justify-between gap-2.5">
              <span className="font-mono text-[11px] tracking-[0.1em] text-hf-ink-soft uppercase">Полный</span>
              <span className="font-mono text-[11px] text-hf-ink-soft">
                {scanCount} / {FREE_TIER_LIMIT} чеков
              </span>
            </div>
            <ul className="space-y-1.5 text-[13px] leading-snug">
              {FULL_TIER_FEATURES.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <div className="h-px bg-hf-receipt-line" />
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[13px]">В месяц</span>
              <span className="font-mono text-[15px] font-medium text-hf-accent-ink">{formatMoney(2990)}</span>
            </div>
            <button
              type="button"
              disabled={activateSubscription.isPending}
              onClick={() => activateSubscription.mutate(undefined, { onSuccess: () => toast.success('Тариф «Полный» активирован') })}
              className="rounded-[13px] bg-hf-accent py-3 text-[15px] font-medium text-white disabled:opacity-50"
            >
              {activateSubscription.isPending ? 'Активация…' : 'Активировать'}
            </button>
            <p className="text-[11px] leading-snug text-hf-ink-soft">
              Оплата внутри Telegram появится позже — пока это демонстрация тарифа.
            </p>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <SectionTitle>Доход</SectionTitle>
        <p className="text-[13px] leading-relaxed text-hf-text-3">
          От него считается «сколько можно тратить в день». Без дохода приложение показывает только факты, без прогноза.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Доход в месяц">
            <input type="number" value={income} onChange={(e) => setIncome(e.target.value)} onBlur={saveIncome} placeholder="Не указан" className={inputClass} />
          </Field>
          <Field label="День зарплаты">
            <input type="number" min={1} max={31} value={payday} onChange={(e) => setPayday(e.target.value)} onBlur={savePayday} placeholder="1—31" className={inputClass} />
          </Field>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h3 className="text-[13px] font-medium text-hf-text">Напоминание о чеках</h3>
            <p className="text-[11px] leading-snug text-hf-text-4">Бот напишет вечером, если за день не было ни одного чека.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={user.daily_reminder_enabled}
            aria-label="Ежедневное напоминание загрузить чеки"
            onClick={() => updateUser.mutate({ id: user.id, patch: { daily_reminder_enabled: !user.daily_reminder_enabled } })}
            className={cn(
              'relative h-6 w-11 shrink-0 rounded-full transition-colors',
              user.daily_reminder_enabled ? 'bg-hf-accent' : 'bg-hf-track',
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform',
                user.daily_reminder_enabled ? 'translate-x-[22px]' : 'translate-x-0.5',
              )}
            />
          </button>
        </div>
        {user.daily_reminder_enabled && (
          <Field label="Время напоминания">
            <input
              type="time"
              value={user.daily_reminder_time.slice(0, 5)}
              onChange={(e) => updateUser.mutate({ id: user.id, patch: { daily_reminder_time: e.target.value } })}
              className={inputClass}
            />
          </Field>
        )}
      </section>

      <section className="space-y-2">
        <SectionTitle>Категории</SectionTitle>
        <ul className="space-y-1.5">
          {categories?.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 rounded-[12px] bg-hf-card px-3 py-2.5">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-[13px] text-hf-text-2">{c.name}</span>
                <span className="shrink-0 font-mono text-[11px] text-hf-text-4">{c.type === 'expense' ? 'расход' : 'доход'}</span>
              </span>
              {c.is_system ? (
                <span className="shrink-0 font-mono text-[11px] text-hf-text-4">системная</span>
              ) : (
                <button
                  type="button"
                  onClick={() => handleDeleteCategory(c.id)}
                  aria-label={`Удалить категорию ${c.name}`}
                  className="shrink-0 text-hf-text-4"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>

        <div className="space-y-2 pt-1">
          <div className="flex rounded-[12px] bg-hf-card p-1">
            {(['expense', 'income'] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => setNewCategoryType(kind)}
                className={cn(
                  'flex-1 rounded-[9px] py-2 text-[13px] transition-colors',
                  newCategoryType === kind ? 'bg-hf-accent font-medium text-white' : 'text-hf-text-4',
                )}
              >
                {kind === 'expense' ? 'Расход' : 'Доход'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="Название категории"
              className={cn(inputClass, 'min-w-0 flex-1')}
              onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
            />
            <button
              type="button"
              onClick={handleAddCategory}
              disabled={addCategory.isPending}
              aria-label="Добавить категорию"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-hf-card text-hf-text-2 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
