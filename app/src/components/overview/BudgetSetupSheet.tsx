import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useUpdateUser } from '@/hooks/use-finance-data'
import { useCurrentUser } from '@/lib/auth'
import { currencySymbol } from '@/lib/format'
import { cn } from '@/lib/utils'

const inputClass =
  'h-10 w-full rounded-[10px] border border-hf-line bg-hf-bar px-3 text-[13px] text-hf-text placeholder:text-hf-text-4 focus:border-hf-accent focus:outline-none'

/**
 * Замена «профилю пользователя»: три настройки, от которых реально зависят
 * цифры на «Обзоре» — доход, день зарплаты, ежедневное напоминание о чеках.
 * Ни аватара, ни имени, ни темы: в приложении один общий аккаунт, личная
 * страница ничего не решала.
 *
 * Категориями управляет экран «Чеки» (там они и выбираются), поэтому их
 * список сюда не переехал.
 */
export function BudgetSetupSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const user = useCurrentUser()
  const updateUser = useUpdateUser()

  const [income, setIncome] = useState(user.monthly_income?.toString() ?? '')
  const [payday, setPayday] = useState(user.payday?.toString() ?? '')

  useEffect(() => {
    setIncome(user.monthly_income?.toString() ?? '')
    setPayday(user.payday?.toString() ?? '')
  }, [user.id, open])

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
    updateUser.mutate({ id: user.id, patch: { payday: valid ? n : null } }, { onSuccess: () => toast.success('День зарплаты обновлён') })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-[24px] border-hf-line bg-hf-bg">
        <SheetHeader className="px-4 pt-1 pb-0">
          <SheetTitle className="text-[15px] font-medium text-hf-text">Бюджет и напоминания</SheetTitle>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-8">
          <p className="text-[13px] leading-relaxed text-hf-text-3">
            От дохода считается «сколько можно тратить в день». Без него приложение показывает только факты.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] text-hf-text-4">Доход в месяц, {currencySymbol()}</span>
              <input
                type="number"
                inputMode="numeric"
                value={income}
                onChange={(e) => setIncome(e.target.value)}
                onBlur={saveIncome}
                placeholder="Не указан"
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] text-hf-text-4">День зарплаты</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={31}
                value={payday}
                onChange={(e) => setPayday(e.target.value)}
                onBlur={savePayday}
                placeholder="1—31"
                className={inputClass}
              />
            </label>
          </div>

          <div className="flex items-start justify-between gap-3 border-t border-hf-line pt-4">
            <div className="min-w-0 space-y-1">
              <p className="text-[13px] font-medium text-hf-text">Напоминание о чеках</p>
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
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] text-hf-text-4">Время напоминания</span>
              <input
                type="time"
                value={user.daily_reminder_time.slice(0, 5)}
                onChange={(e) => updateUser.mutate({ id: user.id, patch: { daily_reminder_time: e.target.value } })}
                className={inputClass}
              />
            </label>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
