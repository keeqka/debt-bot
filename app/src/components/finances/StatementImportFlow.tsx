import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { FileStack, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { parseStatement } from '@/lib/api'
import { fileToBase64 } from '@/lib/file-to-base64'
import { useAddExpensesBulk, useAddIncomesBulk, useCategories } from '@/hooks/use-finance-data'
import { useCurrentUserId } from '@/lib/auth'
import type { StatementTransaction } from '@/types/domain'

interface Row extends StatementTransaction {
  key: string
  included: boolean
  categoryId: string
}

/**
 * "Загрузи выписку — разбери и предложи траты" (ТЗ chat request). Unlike a
 * single receipt, a statement can hold dozens of transactions, so instead
 * of one confirm screen this is a checklist: every row is editable and
 * selectable, nothing gets written to expenses/incomes until "Сохранить".
 */
export function StatementImportFlow() {
  const inputRef = useRef<HTMLInputElement>(null)
  const userId = useCurrentUserId()
  const { data: categories } = useCategories()
  const addExpensesBulk = useAddExpensesBulk()
  const addIncomesBulk = useAddIncomesBulk()

  const [status, setStatus] = useState<'idle' | 'parsing' | 'review'>('idle')
  const [rows, setRows] = useState<Row[]>([])

  const expenseCategories = categories?.filter((c) => c.type === 'expense') ?? []
  const isSaving = addExpensesBulk.isPending || addIncomesBulk.isPending
  const includedCount = rows.filter((r) => r.included).length

  async function handleFile(file: File) {
    setStatus('parsing')
    try {
      const base64 = await fileToBase64(file)
      const parsed = await parseStatement(base64, file.type || 'application/pdf')
      if (!parsed.is_valid_statement || parsed.transactions.length === 0) {
        toast.error('Не нашёл операций в файле — попробуйте другую выписку или добавьте траты вручную')
        setStatus('idle')
        return
      }
      setRows(
        parsed.transactions.map((t) => ({
          ...t,
          key: crypto.randomUUID(),
          included: true,
          categoryId: (t.direction === 'expense' && expenseCategories.find((c) => c.name === t.suggested_category)?.id) || '',
        })),
      )
      setStatus('review')
    } catch {
      toast.error('Не удалось разобрать выписку, попробуйте ещё раз')
      setStatus('idle')
    }
  }

  function updateRow(key: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  async function handleSave() {
    const included = rows.filter((r) => r.included)
    if (included.length === 0) {
      toast.error('Выберите хотя бы одну операцию')
      return
    }

    const expenseRows = included.filter((r) => r.direction === 'expense')
    const incomeRows = included.filter((r) => r.direction === 'income')

    if (expenseRows.length > 0) {
      await addExpensesBulk.mutateAsync(
        expenseRows.map((r) => ({
          user_id: userId,
          amount: r.amount,
          currency: 'KZT',
          category_id: r.categoryId || null,
          merchant: r.description,
          spent_at: r.date,
          description: null,
          source: 'statement',
          receipt_asset_path: null,
          ai_confidence: r.confidence,
          is_confirmed: true,
        })),
      )
    }
    if (incomeRows.length > 0) {
      await addIncomesBulk.mutateAsync(
        incomeRows.map((r) => ({
          user_id: userId,
          source: r.description,
          amount: r.amount,
          currency: 'KZT',
          received_at: r.date,
          is_recurring: false,
          recurrence_day: null,
        })),
      )
    }

    toast.success(`Добавлено операций: ${included.length}`)
    setStatus('idle')
    setRows([])
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
          e.target.value = ''
        }}
      />
      <Button variant="outline" className="h-auto flex-col gap-1.5 rounded-2xl py-3" onClick={() => inputRef.current?.click()}>
        <FileStack className="h-4 w-4" />
        <span className="text-xs">Выписка</span>
      </Button>

      <Dialog open={status === 'parsing'}>
        <DialogContent className="max-w-xs" showCloseButton={false}>
          <div className="flex flex-col items-center gap-3 py-6">
            <Loader2 className="text-primary h-6 w-6 animate-spin" />
            <p className="text-muted-foreground text-sm">AI разбирает выписку, это может занять минуту...</p>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={status === 'review'} onOpenChange={(open) => !open && setStatus('idle')}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Найдено операций: {rows.length}</DialogTitle>
          </DialogHeader>

          <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
            {rows.map((row) => (
              <div key={row.key} className="space-y-2 rounded-xl border border-border p-2.5">
                <div className="flex items-start gap-2">
                  <Checkbox
                    checked={row.included}
                    onCheckedChange={(checked) => updateRow(row.key, { included: checked === true })}
                    className="mt-2"
                  />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Input
                      value={row.description}
                      onChange={(e) => updateRow(row.key, { description: e.target.value })}
                      className="h-8 text-xs"
                    />
                    <input
                      type="date"
                      value={row.date}
                      onChange={(e) => updateRow(row.key, { date: e.target.value })}
                      className="border-input text-muted-foreground h-7 w-full rounded-md border bg-transparent px-2 text-[11px]"
                    />
                  </div>
                  <Input
                    type="number"
                    value={row.amount}
                    onChange={(e) => updateRow(row.key, { amount: Number(e.target.value) })}
                    className="h-8 w-24 text-right text-xs"
                  />
                </div>
                <div className="flex items-center gap-1.5 pl-6">
                  <Select value={row.direction} onValueChange={(v) => updateRow(row.key, { direction: (v as Row['direction']) ?? 'expense' })}>
                    <SelectTrigger className="h-7 w-[104px] shrink-0 text-[11px]">
                      <SelectValue>{(v: string) => (v === 'income' ? 'Доход' : 'Расход')}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="expense">Расход</SelectItem>
                      <SelectItem value="income">Доход</SelectItem>
                    </SelectContent>
                  </Select>
                  {row.direction === 'expense' && (
                    <Select value={row.categoryId} onValueChange={(v) => updateRow(row.key, { categoryId: v ?? '' })}>
                      <SelectTrigger className="h-7 min-w-0 flex-1 text-[11px]">
                        <SelectValue placeholder="Категория">
                          {(value: string | null) => (value ? expenseCategories.find((c) => c.id === value)?.name : null) ?? 'Категория'}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {expenseCategories.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {row.confidence < 0.6 && (
                    <Badge variant="outline" className="border-status-yellow text-status-yellow shrink-0 text-[10px]">
                      уточнить
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button onClick={handleSave} disabled={isSaving || includedCount === 0} className="w-full">
              {isSaving ? 'Сохранение...' : `Сохранить выбранные (${includedCount})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
