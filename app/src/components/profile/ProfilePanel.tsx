import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, X } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { useAddCategory, useCategories, useDeleteCategory, useUpdateUser } from '@/hooks/use-finance-data'
import { useCurrentUser } from '@/lib/auth'
import { isBackendConfigured } from '@/lib/env'
import { isInsideTelegram } from '@/lib/telegram'
import { cn } from '@/lib/utils'
import type { CategoryType } from '@/types/domain'

/**
 * Профиль — доход/дата зарплаты (Overview's budget math depends on this),
 * ежедневное напоминание о чеках, категории (уже был реальный CRUD).
 * Тема больше не выбирается (дизайн тёмный по умолчанию) — переключатель
 * убран. Валюта тоже убрана: в приложении нет никакой другой точки, которая
 * бы её реально учитывала (formatMoney всегда KZT), так что показывать
 * рабочий на вид, но ничего не значащий селектор было бы хуже, чем не
 * показывать его вовсе.
 */
export function ProfilePanel() {
  const user = useCurrentUser()
  const { data: categories } = useCategories()
  const addCategory = useAddCategory()
  const deleteCategory = useDeleteCategory()
  const updateUser = useUpdateUser()

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
    updateUser.mutate(
      { id: user.id, patch: { payday: valid ? n : null } },
      { onSuccess: () => toast.success('Дата зарплаты обновлена') },
    )
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

  return (
    <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 pb-8">
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground">Подключение</h3>
        <div className="flex items-center justify-between rounded-xl border border-border p-3">
          <span className="text-sm">Telegram</span>
          <Badge variant={isInsideTelegram() ? 'default' : 'secondary'}>{isInsideTelegram() ? 'Подключено' : 'Открыто вне Telegram'}</Badge>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-border p-3">
          <span className="text-sm">Backend (Supabase)</span>
          <Badge variant={isBackendConfigured ? 'default' : 'secondary'}>{isBackendConfigured ? 'Подключено' : 'Демо-режим'}</Badge>
        </div>
      </section>

      <Separator />

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground">Доход</h3>
        <p className="text-xs text-muted-foreground">
          Используется для «Обзора» — сколько можно тратить в день. Без этого поля приложение показывает только факты, без прогноза.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Доход в месяц, ₸</Label>
            <Input type="number" value={income} onChange={(e) => setIncome(e.target.value)} onBlur={saveIncome} placeholder="Не указан" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">День зарплаты</Label>
            <Input type="number" min={1} max={31} value={payday} onChange={(e) => setPayday(e.target.value)} onBlur={savePayday} placeholder="1-31" />
          </div>
        </div>
      </section>

      <Separator />

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Напоминание о чеках</h3>
            <p className="text-xs text-muted-foreground">Бот напишет вечером, если сегодня не было ни одного чека.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={user.daily_reminder_enabled}
            onClick={() => updateUser.mutate({ id: user.id, patch: { daily_reminder_enabled: !user.daily_reminder_enabled } })}
            className={cn(
              'relative h-6 w-11 shrink-0 rounded-full transition-colors',
              user.daily_reminder_enabled ? 'bg-primary' : 'bg-muted',
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 h-5 w-5 rounded-full bg-background transition-transform',
                user.daily_reminder_enabled ? 'translate-x-[22px]' : 'translate-x-0.5',
              )}
            />
          </button>
        </div>
        {user.daily_reminder_enabled && (
          <div className="space-y-1.5">
            <Label className="text-xs">Время напоминания</Label>
            <input
              type="time"
              value={user.daily_reminder_time.slice(0, 5)}
              onChange={(e) => updateUser.mutate({ id: user.id, patch: { daily_reminder_time: e.target.value } })}
              className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm"
            />
          </div>
        )}
      </section>

      <Separator />

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground">Категории</h3>
        <ul className="space-y-1.5">
          {categories?.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate">{c.name}</span>
                <span className="text-muted-foreground shrink-0 text-[10px] uppercase">{c.type === 'expense' ? 'расход' : 'доход'}</span>
              </span>
              {c.is_system ? (
                <span className="text-muted-foreground shrink-0 text-xs">системная</span>
              ) : (
                <button
                  onClick={() => handleDeleteCategory(c.id)}
                  aria-label={`Удалить категорию ${c.name}`}
                  className="text-muted-foreground hover:text-destructive shrink-0"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>

        <div className="space-y-2 pt-1">
          <Select value={newCategoryType} onValueChange={(v) => setNewCategoryType((v ?? 'expense') as CategoryType)}>
            <SelectTrigger className="w-full">
              <SelectValue>{(value: CategoryType) => (value === 'expense' ? 'Новая: расход' : 'Новая: доход')}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="expense">Новая категория расхода</SelectItem>
              <SelectItem value="income">Новая категория дохода</SelectItem>
            </SelectContent>
          </Select>
          <div className={cn('flex items-center gap-2')}>
            <Input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="Название категории"
              className="min-w-0 flex-1"
              onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
            />
            <Button size="icon" variant="outline" className="shrink-0" onClick={handleAddCategory} disabled={addCategory.isPending}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
