import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, X, Sun, Moon, Monitor } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { useAddCategory, useCategories, useDeleteCategory } from '@/hooks/use-finance-data'
import { isBackendConfigured } from '@/lib/env'
import { isInsideTelegram } from '@/lib/telegram'
import { getStoredThemeMode, setThemeMode, type ThemeMode } from '@/lib/theme'
import { cn } from '@/lib/utils'
import type { CategoryType } from '@/types/domain'

const CURRENCY_LABELS: Record<string, string> = { KZT: 'KZT — тенге', USD: 'USD — доллар', EUR: 'EUR — евро' }

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Светлая', icon: Sun },
  { value: 'dark', label: 'Тёмная', icon: Moon },
  { value: 'system', label: 'Системная', icon: Monitor },
]

/** ТЗ экран 6 "Настройки": категории, базовая валюта, время уведомлений, статус бота. */
export function SettingsPanel() {
  const { data: categories } = useCategories()
  const addCategory = useAddCategory()
  const deleteCategory = useDeleteCategory()
  const [weeklyTime, setWeeklyTime] = useState('19:00')
  const [monthlyTime, setMonthlyTime] = useState('20:00')
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryType, setNewCategoryType] = useState<CategoryType>('expense')
  const [theme, setTheme] = useState<ThemeMode>(getStoredThemeMode)

  function handleThemeChange(mode: ThemeMode) {
    setTheme(mode)
    setThemeMode(mode)
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
          <Badge variant={isInsideTelegram() ? 'default' : 'secondary'}>
            {isInsideTelegram() ? 'Подключено' : 'Открыто вне Telegram'}
          </Badge>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-border p-3">
          <span className="text-sm">Backend (Supabase)</span>
          <Badge variant={isBackendConfigured ? 'default' : 'secondary'}>
            {isBackendConfigured ? 'Подключено' : 'Демо-режим'}
          </Badge>
        </div>
      </section>

      <Separator />

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground">Оформление</h3>
        <div className="grid grid-cols-3 gap-2">
          {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => handleThemeChange(value)}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-xl border p-3 text-xs transition-colors',
                theme === value ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:bg-muted/50',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </section>

      <Separator />

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground">Базовая валюта</h3>
        <Select defaultValue="KZT">
          <SelectTrigger className="w-full">
            <SelectValue>{(value: string) => CURRENCY_LABELS[value] ?? value}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="KZT">KZT — тенге</SelectItem>
            <SelectItem value="USD">USD — доллар</SelectItem>
            <SelectItem value="EUR">EUR — евро</SelectItem>
          </SelectContent>
        </Select>
      </section>

      <Separator />

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground">Уведомления в Telegram</h3>
        <div className="space-y-2">
          <Label className="text-xs">Еженедельная сводка (вс.)</Label>
          <input
            type="time"
            value={weeklyTime}
            onChange={(e) => setWeeklyTime(e.target.value)}
            className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Ежемесячная сводка (посл. день)</Label>
          <input
            type="time"
            value={monthlyTime}
            onChange={(e) => setMonthlyTime(e.target.value)}
            className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm"
          />
        </div>
        <p className="text-muted-foreground text-xs">Часовой пояс: Asia/Almaty</p>
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
          <div className="flex items-center gap-2">
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
