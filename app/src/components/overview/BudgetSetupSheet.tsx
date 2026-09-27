import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, X } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { useAddCategory, useCategories, useDeleteAllExpenses, useDeleteCategory, useExpenses, useUpdateUser } from '@/hooks/use-finance-data'
import { useCurrentUser } from '@/lib/auth'
import { currencySymbol } from '@/lib/format'
import { cn } from '@/lib/utils'
import { PlanSettingsSection } from '@/components/overview/PlanSettingsSection'
import { Toggle } from '@/components/chrome/Toggle'
import { FamilySection } from '@/components/overview/FamilySection'
import { SupportSection } from '@/components/overview/SupportSection'
import type { CategoryType } from '@/types/domain'

const inputClass =
  'h-10 w-full rounded-[10px] border border-hf-line bg-hf-bar px-3 text-[13px] text-hf-text placeholder:text-hf-text-4 focus:border-hf-accent focus:outline-none'

const WIPE_CONFIRM_WORD = 'УДАЛИТЬ'

/**
 * Замена «профилю пользователя»: настройки, от которых реально зависят
 * цифры на «Обзоре» — доход, день зарплаты, ежедневное напоминание о чеках —
 * плюс категории (раньше жили в неиспользуемом ProfilePanel.tsx без входа
 * в него; экран «Чеки» их только выбирает для строки, не создаёт и не
 * удаляет). Ни аватара, ни имени, ни темы: в приложении один общий аккаунт,
 * личная страница ничего не решала.
 */
export function BudgetSetupSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const user = useCurrentUser()
  const updateUser = useUpdateUser()
  const { data: categories } = useCategories()
  const addCategory = useAddCategory()
  const deleteCategory = useDeleteCategory()
  const { data: expenses } = useExpenses()
  const deleteAllExpenses = useDeleteAllExpenses()

  const [income, setIncome] = useState(user.monthly_income?.toString() ?? '')
  const [payday, setPayday] = useState(user.payday?.toString() ?? '')
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryType, setNewCategoryType] = useState<CategoryType>('expense')
  const [wipeOpen, setWipeOpen] = useState(false)
  const [wipeConfirmText, setWipeConfirmText] = useState('')

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

  async function handleWipeExpenses() {
    await deleteAllExpenses.mutateAsync()
    toast.success('Все траты удалены')
    setWipeOpen(false)
    setWipeConfirmText('')
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="flex max-h-[85vh] flex-col rounded-t-[24px] border-hf-line bg-hf-bg">
        <SheetHeader className="px-4 pt-1 pb-0">
          <SheetTitle className="text-[15px] font-medium text-hf-text">Настройки</SheetTitle>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-8">
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
            <Toggle
              checked={user.daily_reminder_enabled}
              label="Ежедневное напоминание загрузить чеки"
              onChange={(next) => updateUser.mutate({ id: user.id, patch: { daily_reminder_enabled: next } })}
            />
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

          <PlanSettingsSection />

          <FamilySection />

          <SupportSection />

          <div className="space-y-3 border-t border-hf-line pt-4">
            <p className="text-[13px] font-medium text-hf-text">Категории</p>
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
                className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-hf-card text-hf-text-2 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="space-y-2 border-t border-hf-line pt-4">
            <p className="text-[13px] font-medium text-hf-text">Опасная зона</p>
            <button
              type="button"
              onClick={() => setWipeOpen(true)}
              disabled={!expenses?.length}
              className="w-full rounded-[13px] border border-hf-warn/30 bg-hf-card py-3 text-[13px] font-medium text-hf-warn disabled:opacity-40"
            >
              Удалить все траты{expenses?.length ? ` (${expenses.length})` : ''}
            </button>
          </div>
        </div>
      </SheetContent>

      <Sheet open={wipeOpen} onOpenChange={(o) => { setWipeOpen(o); if (!o) setWipeConfirmText('') }}>
        <SheetContent side="bottom" className="rounded-t-[24px] border-hf-line bg-hf-bg" showCloseButton={false}>
          <SheetHeader className="px-4 pt-1 pb-0">
            <SheetTitle className="text-[15px] font-medium text-hf-text">Удалить все траты?</SheetTitle>
            <SheetDescription className="text-[13px] leading-relaxed text-hf-text-3">
              Это безвозвратно удалит {expenses?.length ?? 0} {expenses?.length === 1 ? 'трату' : 'трат'} — долги, доходы
              и цели не затронет. Чтобы подтвердить, напиши «{WIPE_CONFIRM_WORD}»:
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4">
            <input
              value={wipeConfirmText}
              onChange={(e) => setWipeConfirmText(e.target.value)}
              placeholder={WIPE_CONFIRM_WORD}
              autoCapitalize="characters"
              className={inputClass}
            />
          </div>
          <div className="flex gap-2.5 px-4 pb-8">
            <button type="button" onClick={() => setWipeOpen(false)} className="flex-1 rounded-[13px] bg-hf-card py-3.5 text-[15px] text-hf-text-2">
              Отмена
            </button>
            <button
              type="button"
              onClick={handleWipeExpenses}
              disabled={wipeConfirmText.trim().toUpperCase() !== WIPE_CONFIRM_WORD || deleteAllExpenses.isPending}
              className="flex-1 rounded-[13px] bg-hf-warn py-3.5 text-[15px] font-medium text-white disabled:opacity-50"
            >
              {deleteAllExpenses.isPending ? 'Секунду…' : 'Удалить всё'}
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </Sheet>
  )
}
