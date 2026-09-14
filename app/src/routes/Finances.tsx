import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useCategories, useDeleteExpense, useDeleteIncome, useExpenses, useIncomes } from '@/hooks/use-finance-data'
import { formatMoney, formatDateShort } from '@/lib/format'
import { AddTransactionDialog } from '@/components/finances/AddTransactionDialog'
import { ReceiptCaptureFlow } from '@/components/finances/ReceiptCaptureFlow'
import { CategoryDonutChart } from '@/components/charts/CategoryDonutChart'

type Filter = 'all' | 'expense' | 'income'

interface LedgerRow {
  id: string
  type: 'expense' | 'income'
  amount: number
  currency: string
  date: string
  label: string
  needsReview?: boolean
}

export function Finances() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: expenses, isLoading: expensesLoading } = useExpenses()
  const { data: incomes, isLoading: incomesLoading } = useIncomes()
  const { data: categories } = useCategories()
  const deleteExpense = useDeleteExpense()
  const deleteIncome = useDeleteIncome()

  const [filter, setFilter] = useState<Filter>('all')
  const [addOpen, setAddOpen] = useState(searchParams.get('add') === 'manual')
  const [deletingRow, setDeletingRow] = useState<LedgerRow | null>(null)

  const autoOpenReceipt = searchParams.get('add') === 'receipt'

  useEffect(() => {
    // consume the deep-link param once so it doesn't keep reopening dialogs on re-render
    if (searchParams.get('add')) setSearchParams({}, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const rows: LedgerRow[] = useMemo(() => {
    const expenseRows: LedgerRow[] = (expenses ?? []).map((e) => ({
      id: e.id,
      type: 'expense',
      amount: e.amount,
      currency: e.currency,
      date: e.spent_at,
      label: e.merchant ?? categories?.find((c) => c.id === e.category_id)?.name ?? e.description ?? 'Расход',
      needsReview: !e.is_confirmed,
    }))
    const incomeRows: LedgerRow[] = (incomes ?? []).map((i) => ({
      id: i.id,
      type: 'income',
      amount: i.amount,
      currency: i.currency,
      date: i.received_at,
      label: i.source,
    }))
    return [...expenseRows, ...incomeRows].sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [expenses, incomes, categories])

  const filteredRows = rows.filter((r) => filter === 'all' || r.type === filter)
  const isLoading = expensesLoading || incomesLoading
  const isDeleting = deleteExpense.isPending || deleteIncome.isPending

  async function confirmDelete() {
    if (!deletingRow) return
    if (deletingRow.type === 'expense') {
      await deleteExpense.mutateAsync(deletingRow.id)
    } else {
      await deleteIncome.mutateAsync(deletingRow.id)
    }
    toast.success(deletingRow.type === 'expense' ? 'Расход удалён' : 'Доход удалён')
    setDeletingRow(null)
  }

  return (
    <div className="space-y-5 pb-6">
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => setAddOpen(true)} className="h-auto flex-col gap-1.5 rounded-2xl py-3" variant="outline">
          <Plus className="h-4 w-4" />
          <span className="text-xs">Добавить вручную</span>
        </Button>
        <ReceiptCaptureFlow autoOpen={autoOpenReceipt} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">По категориям</CardTitle>
        </CardHeader>
        <CardContent>
          {categories && expenses ? (
            <CategoryDonutChart expenses={expenses} categories={categories} />
          ) : (
            <Skeleton className="h-40 w-full" />
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList className="w-full">
            <TabsTrigger value="all">Все</TabsTrigger>
            <TabsTrigger value="expense">Расходы</TabsTrigger>
            <TabsTrigger value="income">Доходы</TabsTrigger>
          </TabsList>
        </Tabs>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : (
          <ul className="space-y-2">
            {filteredRows.map((row) => (
              <li key={`${row.type}-${row.id}`} className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{row.label}</p>
                  <p className="text-muted-foreground text-xs">{formatDateShort(row.date)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {row.needsReview && (
                    <Badge variant="outline" className="border-status-yellow text-status-yellow text-[10px]">
                      уточнить
                    </Badge>
                  )}
                  <span className={row.type === 'income' ? 'text-status-green text-sm font-semibold' : 'text-sm font-semibold'}>
                    {row.type === 'income' ? '+' : '−'}
                    {formatMoney(row.amount, row.currency)}
                  </span>
                  <button
                    onClick={() => setDeletingRow(row)}
                    aria-label={`Удалить: ${row.label}`}
                    className="text-muted-foreground hover:text-destructive shrink-0 p-1"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
            {filteredRows.length === 0 && <p className="text-muted-foreground py-8 text-center text-sm">Записей пока нет</p>}
          </ul>
        )}
      </div>

      <AddTransactionDialog open={addOpen} onOpenChange={setAddOpen} />

      <AlertDialog open={Boolean(deletingRow)} onOpenChange={(open) => !open && setDeletingRow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить запись?</AlertDialogTitle>
            <AlertDialogDescription>
              «{deletingRow?.label}» на {deletingRow ? formatMoney(deletingRow.amount, deletingRow.currency) : ''} удалится безвозвратно.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={isDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isDeleting ? 'Удаление...' : 'Удалить'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
