import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Camera, FileStack, Plus, Trash2 } from 'lucide-react'
import { Eyebrow, Action, ActionBar } from '@/components/chrome/Chrome'
import { Paper } from '@/components/chrome/Paper'
import { Mascot } from '@/components/Mascot'
import { useReceiptDraft, type StatementDraftRow } from '@/hooks/use-receipt-draft'
import {
  useAddExpense,
  useAddExpensesBulk,
  useAddIncomesBulk,
  useCategories,
  useExpenses,
  useDeleteExpense,
  useDeleteIncome,
  useIncomes,
  useLogReceiptScan,
  useReceiptScanCount,
  useSubscription,
} from '@/hooks/use-finance-data'
import { useCurrentUserId } from '@/lib/auth'
import { parseReceipt, parseStatement } from '@/lib/api'
import { fileToBase64 } from '@/lib/file-to-base64'
import { formatMoney, formatDateShort } from '@/lib/format'
import { AddTransactionDialog } from '@/components/finances/AddTransactionDialog'
import { cn } from '@/lib/utils'
import type { Category, Expense, Income, ReceiptParseResult } from '@/types/domain'

const MAX_FILE_BYTES = 15 * 1024 * 1024
const FREE_TIER_WARN_AT = 25
const FREE_TIER_LIMIT = 30

function validateFile(file: File): string | null {
  const okType = file.type.startsWith('image/') || file.type === 'application/pdf'
  if (!okType) return 'Неподдерживаемый формат — нужно фото или PDF.'
  if (file.size > MAX_FILE_BYTES) return 'Файл слишком большой (максимум 15 МБ).'
  return null
}

/**
 * Единый таб «Чеки»: фото/PDF чека, выписка, ручной ввод — раньше три
 * отдельные точки входа на разных экранах (Dashboard/Finances), теперь
 * один поток. Состояние — в useReceiptDraft (query cache), переживает
 * переключение таба (ТЗ FUNCTIONAL.md §5, §8).
 */
export function Receipt() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { draft, setDraft, reset } = useReceiptDraft()
  const userId = useCurrentUserId()
  const { data: categories } = useCategories()
  const { data: expenses } = useExpenses()
  const { data: incomes } = useIncomes()
  const addExpense = useAddExpense()
  const addExpensesBulk = useAddExpensesBulk()
  const addIncomesBulk = useAddIncomesBulk()
  const deleteExpense = useDeleteExpense()
  const deleteIncome = useDeleteIncome()
  const { data: subscription } = useSubscription()
  const { data: scanCount = 0 } = useReceiptScanCount()
  const logScan = useLogReceiptScan()

  const isFreeTier = subscription?.status !== 'active'
  const scansLeft = FREE_TIER_LIMIT - scanCount
  const atScanLimit = isFreeTier && scansLeft <= 0

  const receiptInputRef = useRef<HTMLInputElement>(null)
  const statementInputRef = useRef<HTMLInputElement>(null)
  const [manualOpen, setManualOpen] = useState(searchParams.get('add') === 'manual')

  useEffect(() => {
    if (searchParams.get('add') === 'receipt') receiptInputRef.current?.click()
    if (searchParams.get('add')) setSearchParams({}, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const expenseCategories = categories?.filter((c) => c.type === 'expense') ?? []

  async function handleReceiptFile(file: File) {
    if (atScanLimit) {
      setDraft({ status: 'error', message: `Достигнут лимит бесплатного тарифа (${FREE_TIER_LIMIT} чеков в месяц) — оформи «Полный», чтобы продолжить.` })
      return
    }
    const invalid = validateFile(file)
    if (invalid) {
      setDraft({ status: 'error', message: invalid })
      return
    }
    setDraft({ status: 'uploading', kind: 'receipt' })
    try {
      const base64 = await fileToBase64(file)
      setDraft({ status: 'reading', kind: 'receipt' })
      await logScan.mutateAsync(userId)
      const result = await parseReceipt(base64, file.type || 'image/jpeg')
      if (!result.is_valid_receipt) {
        setDraft({ status: 'error', message: 'Не разобрал — переснять? Убедись, что чек целиком в кадре и хорошо освещён.' })
        return
      }
      const matched = categories?.find((c) => c.name === result.suggested_category)
      setDraft({ status: 'parsed-receipt', result, categoryId: matched?.id ?? '' })
    } catch {
      setDraft({ status: 'error', message: 'Не удалось распознать чек, попробуй ещё раз.' })
    }
  }

  async function handleStatementFile(file: File) {
    if (atScanLimit) {
      setDraft({ status: 'error', message: `Достигнут лимит бесплатного тарифа (${FREE_TIER_LIMIT} чеков в месяц) — оформи «Полный», чтобы продолжить.` })
      return
    }
    const invalid = validateFile(file)
    if (invalid) {
      setDraft({ status: 'error', message: invalid })
      return
    }
    setDraft({ status: 'uploading', kind: 'statement' })
    try {
      const base64 = await fileToBase64(file)
      setDraft({ status: 'reading', kind: 'statement' })
      await logScan.mutateAsync(userId)
      const parsed = await parseStatement(base64, file.type || 'application/pdf')
      if (!parsed.is_valid_statement || parsed.transactions.length === 0) {
        setDraft({ status: 'error', message: 'Не нашёл операций в файле — попробуй другую выписку или добавь траты вручную.' })
        return
      }
      const rows: StatementDraftRow[] = parsed.transactions.map((t) => ({
        ...t,
        key: crypto.randomUUID(),
        included: true,
        categoryId: (t.direction === 'expense' && expenseCategories.find((c) => c.name === t.suggested_category)?.id) || '',
      }))
      setDraft({ status: 'parsed-statement', rows })
    } catch {
      setDraft({ status: 'error', message: 'Не удалось разобрать выписку, попробуй ещё раз.' })
    }
  }

  async function saveReceipt() {
    if (draft.status !== 'parsed-receipt') return
    const { result, categoryId } = draft
    await addExpense.mutateAsync({
      user_id: userId,
      amount: result.total_amount ?? 0,
      currency: result.currency ?? 'KZT',
      category_id: categoryId || null,
      merchant: result.merchant,
      spent_at: result.date ?? new Date().toISOString().slice(0, 10),
      description: null,
      source: 'receipt_photo',
      receipt_asset_path: null,
      ai_confidence: result.confidence,
      is_confirmed: true,
    })
    toast.success('Расход сохранён')
    reset()
  }

  async function saveStatement() {
    if (draft.status !== 'parsed-statement') return
    const included = draft.rows.filter((r) => r.included)
    if (included.length === 0) {
      toast.error('Выбери хотя бы одну операцию')
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
    reset()
  }

  return (
    <div className="space-y-3.5 pb-6">
      <input
        ref={receiptInputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleReceiptFile(file)
          e.target.value = ''
        }}
      />
      <input
        ref={statementInputRef}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleStatementFile(file)
          e.target.value = ''
        }}
      />

      {draft.status === 'idle' && isFreeTier && scanCount >= FREE_TIER_WARN_AT && (
        <div className="rounded-[12px] bg-hf-receipt-warn px-3.5 py-2.5 text-[13px] text-hf-warn-ink">
          {atScanLimit
            ? `Лимит бесплатного тарифа исчерпан (${FREE_TIER_LIMIT} чеков в месяц) — оформи «Полный» в Профиле, чтобы продолжить.`
            : `Осталось ${scansLeft} ${scansLeft === 1 ? 'чек' : 'чека'} из бесплатного лимита на этот месяц.`}
        </div>
      )}

      {draft.status === 'idle' && (
        <IdleView
          onReceipt={() => receiptInputRef.current?.click()}
          onStatement={() => statementInputRef.current?.click()}
          onManual={() => setManualOpen(true)}
          expenses={expenses ?? []}
          incomes={incomes ?? []}
          categories={categories ?? []}
          onDeleteExpense={(id) => deleteExpense.mutateAsync(id).then(() => toast.success('Расход удалён'))}
          onDeleteIncome={(id) => deleteIncome.mutateAsync(id).then(() => toast.success('Доход удалён'))}
        />
      )}

      {(draft.status === 'uploading' || draft.status === 'reading') && <ReadingView />}

      {draft.status === 'error' && <ErrorView message={draft.message} onRetry={reset} />}

      {draft.status === 'parsed-receipt' && (
        <ParsedReceiptView
          result={draft.result}
          categoryId={draft.categoryId}
          categories={expenseCategories}
          expenses={expenses ?? []}
          onChange={(patch) => setDraft({ ...draft, ...patch })}
          onCancel={reset}
          onSave={saveReceipt}
          saving={addExpense.isPending}
        />
      )}

      {draft.status === 'parsed-statement' && (
        <ParsedStatementView
          rows={draft.rows}
          categories={expenseCategories}
          onChange={(rows) => setDraft({ status: 'parsed-statement', rows })}
          onCancel={reset}
          onSave={saveStatement}
          saving={addExpensesBulk.isPending || addIncomesBulk.isPending}
        />
      )}

      <AddTransactionDialog open={manualOpen} onOpenChange={setManualOpen} />
    </div>
  )
}

function IdleView({
  onReceipt,
  onStatement,
  onManual,
  expenses,
  incomes,
  categories,
  onDeleteExpense,
  onDeleteIncome,
}: {
  onReceipt: () => void
  onStatement: () => void
  onManual: () => void
  expenses: Expense[]
  incomes: Income[]
  categories: Category[]
  onDeleteExpense: (id: string) => void
  onDeleteIncome: (id: string) => void
}) {
  const rows = [
    ...expenses.map((e) => ({
      id: e.id,
      type: 'expense' as const,
      amount: e.amount,
      currency: e.currency,
      date: e.spent_at,
      label: e.merchant ?? categories.find((c) => c.id === e.category_id)?.name ?? e.description ?? 'Расход',
      needsReview: !e.is_confirmed,
    })),
    ...incomes.map((i) => ({
      id: i.id,
      type: 'income' as const,
      amount: i.amount,
      currency: i.currency,
      date: i.received_at,
      label: i.source,
      needsReview: false,
    })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1))

  return (
    <>
      <div className="flex gap-2.5">
        <button type="button" onClick={onReceipt} className="flex flex-1 flex-col items-center gap-1.5 rounded-[14px] bg-hf-accent py-3.5 text-white">
          <Camera className="h-4.5 w-4.5" />
          <span className="text-[13px] font-medium">Чек</span>
        </button>
        <button type="button" onClick={onStatement} className="flex flex-1 flex-col items-center gap-1.5 rounded-[14px] bg-hf-card py-3.5 text-hf-text-2">
          <FileStack className="h-4.5 w-4.5" />
          <span className="text-[13px]">Выписка PDF</span>
        </button>
        <button type="button" onClick={onManual} className="flex flex-1 flex-col items-center gap-1.5 rounded-[14px] bg-hf-card py-3.5 text-hf-text-2">
          <Plus className="h-4.5 w-4.5" />
          <span className="text-[13px]">Вручную</span>
        </button>
      </div>

      <Eyebrow>Последнее</Eyebrow>
      <div className="flex flex-col gap-2">
        {rows.map((row) => (
          <div key={`${row.type}-${row.id}`} className="flex items-center justify-between gap-2.5 rounded-[14px] bg-hf-card px-3.5 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-hf-text">{row.label}</p>
              <p className="text-[11px] text-hf-text-4">{formatDateShort(row.date)}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2.5">
              {row.needsReview && <span className="rounded-md border border-hf-warn-on-dark px-1.5 py-0.5 text-[11px] text-hf-warn-on-dark">уточнить</span>}
              <span className={cn('font-mono text-sm', row.type === 'income' ? 'text-hf-ok' : 'text-hf-text')}>
                {row.type === 'income' ? '+' : '−'}
                {formatMoney(row.amount, row.currency)}
              </span>
              <button
                type="button"
                onClick={() => (row.type === 'expense' ? onDeleteExpense(row.id) : onDeleteIncome(row.id))}
                aria-label={`Удалить: ${row.label}`}
                className="text-hf-text-4"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="py-8 text-center text-[13px] text-hf-text-4">Записей пока нет — загрузи первый чек</p>}
      </div>
    </>
  )
}

function ReadingView() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-[20px] bg-hf-card px-5 py-10 text-center">
      <div className="h-[92px] w-[74px]">
        <Mascot expression="focused" />
      </div>
      <p className="text-[13px] text-hf-text-3">Разбираю...</p>
      <div className="w-full space-y-2">
        {[100, 80, 90].map((w, i) => (
          <div key={i} className="h-3 animate-pulse rounded bg-hf-receipt-line/20" style={{ width: `${w}%` }} />
        ))}
      </div>
    </div>
  )
}

function ErrorView({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-[20px] bg-hf-card px-5 py-8 text-center">
      <MascotAlert />
      <p className="text-[13px] leading-relaxed text-hf-text-2">{message}</p>
      <button type="button" onClick={onRetry} className="rounded-[14px] bg-hf-accent px-6 py-3 text-sm font-medium text-white">
        Понятно
      </button>
    </div>
  )
}

function MascotAlert() {
  return (
    <div className="h-[92px] w-[74px]">
      <Mascot expression="alert" />
    </div>
  )
}

function ParsedReceiptView({
  result,
  categoryId,
  categories,
  expenses,
  onChange,
  onCancel,
  onSave,
  saving,
}: {
  result: ReceiptParseResult
  categoryId: string
  categories: Category[]
  expenses: Expense[]
  onChange: (patch: Partial<{ result: ReceiptParseResult; categoryId: string }>) => void
  onCancel: () => void
  onSave: () => void
  saving: boolean
}) {
  const items = result.line_items
  const itemsTotal = items.reduce((s, it) => s + it.amount, 0)
  const total = result.total_amount ?? itemsTotal
  const mismatch = items.length > 0 && Math.abs(itemsTotal - total) > 1

  const isDuplicate = expenses.some(
    (e) => e.merchant === result.merchant && Math.abs(e.amount - total) < 1 && e.spent_at.slice(0, 10) === (result.date ?? '').slice(0, 10),
  )

  function updateItem(index: number, patch: Partial<{ name: string; amount: number }>) {
    const next = items.map((it, i) => (i === index ? { ...it, ...patch } : it))
    onChange({ result: { ...result, line_items: next } })
  }
  function removeItem(index: number) {
    onChange({ result: { ...result, line_items: items.filter((_, i) => i !== index) } })
  }
  function addItem() {
    onChange({ result: { ...result, line_items: [...items, { name: '', amount: 0 }] } })
  }

  const categoryName = categories.find((c) => c.id === categoryId)?.name ?? null

  return (
    <>
      <div className="flex items-center gap-3">
        <div className="h-[92px] w-[74px] shrink-0 overflow-hidden rounded-xl bg-hf-card p-1.5">
          <Mascot expression="focused" />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="text-[13px] leading-snug text-hf-text-2">
            Распознал {items.length} {items.length === 1 ? 'позицию' : 'позиций'}
            {result.confidence < 0.6 ? ' — уверенность низкая, проверь внимательно.' : '.'}
          </p>
          <input
            value={result.merchant ?? ''}
            onChange={(e) => onChange({ result: { ...result, merchant: e.target.value } })}
            placeholder="Магазин"
            className="w-full rounded-md border border-hf-line bg-transparent px-2 py-1 text-[13px] text-hf-text"
          />
        </div>
      </div>

      {isDuplicate && (
        <div className="rounded-[12px] bg-hf-receipt-warn px-3.5 py-2.5 text-[13px] text-hf-warn-ink">
          Похоже, этот чек уже загружен — сумма, магазин и дата совпадают с существующей записью.
        </div>
      )}

      <Paper className="flex flex-col gap-2.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2 text-[13px]">
            <input
              value={item.name}
              onChange={(e) => updateItem(i, { name: e.target.value })}
              placeholder="Позиция не распознана"
              className={cn('min-w-0 flex-1 bg-transparent', !item.name && 'text-hf-warn-ink italic')}
            />
            <input
              type="number"
              value={item.amount}
              onChange={(e) => updateItem(i, { amount: Number(e.target.value) })}
              className="w-20 shrink-0 bg-transparent text-right font-mono"
            />
            <button type="button" onClick={() => removeItem(i)} aria-label="Удалить позицию" className="shrink-0 text-hf-ink-soft">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <button type="button" onClick={addItem} className="self-start text-[13px] text-hf-accent-ink">
          + Добавить позицию
        </button>
        <div className="h-px bg-hf-receipt-line" />
        <div className="flex items-center justify-between gap-2.5 text-[15px] font-medium">
          <span>Итого</span>
          <span className={cn('font-mono', mismatch ? 'text-hf-warn-ink' : 'text-hf-accent-ink')}>{formatMoney(total)}</span>
        </div>
        {mismatch && <p className="text-[11px] text-hf-warn-ink">Сумма позиций ({formatMoney(itemsTotal)}) не сходится с итогом чека.</p>}
      </Paper>

      <div className="flex flex-col gap-2.5">
        <Eyebrow>Категория</Eyebrow>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onChange({ categoryId: c.id })}
              className={cn('rounded-[10px] px-3.5 py-2 text-[13px]', c.id === categoryId ? 'bg-hf-accent text-white' : 'bg-hf-card text-hf-text-4')}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-start gap-2.5 rounded-[14px] bg-hf-bar p-3.5">
        <span className="mt-1.5 h-[7px] w-[7px] shrink-0 rounded-full bg-hf-ok" />
        <p className="text-[13px] leading-snug text-hf-text-3">
          Сохраню в «{categoryName ?? 'без категории'}» за {formatDateShort(result.date ?? new Date().toISOString())}.
        </p>
      </div>

      <ActionBar>
        <Action variant="muted" onClick={onCancel}>
          Отмена
        </Action>
        <Action onClick={onSave} disabled={saving}>
          {saving ? 'Сохранение...' : 'Сохранить'}
        </Action>
      </ActionBar>
    </>
  )
}

function ParsedStatementView({
  rows,
  categories,
  onChange,
  onCancel,
  onSave,
  saving,
}: {
  rows: StatementDraftRow[]
  categories: Category[]
  onChange: (rows: StatementDraftRow[]) => void
  onCancel: () => void
  onSave: () => void
  saving: boolean
}) {
  function updateRow(key: string, patch: Partial<StatementDraftRow>) {
    onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  const includedCount = rows.filter((r) => r.included).length
  const recurring = detectRecurring(rows)

  return (
    <>
      <Eyebrow>Найдено операций: {rows.length}</Eyebrow>

      {recurring.length > 0 && (
        <Paper className="flex flex-col gap-2">
          <span className="text-sm font-medium">Похоже на подписки и комиссии</span>
          {recurring.map((desc) => (
            <PaperRowLike key={desc} label={desc} />
          ))}
        </Paper>
      )}

      <div className="flex flex-col gap-2">
        {rows.map((row) => (
          <div key={row.key} className="flex flex-col gap-2 rounded-[14px] bg-hf-card p-3">
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={row.included}
                onChange={(e) => updateRow(row.key, { included: e.target.checked })}
                className="mt-2.5 h-4 w-4 shrink-0 accent-hf-accent"
              />
              <div className="min-w-0 flex-1 space-y-1.5">
                <input
                  value={row.description}
                  onChange={(e) => updateRow(row.key, { description: e.target.value })}
                  className="h-8 w-full rounded-md bg-hf-bar px-2 text-[13px] text-hf-text"
                />
                <input
                  type="date"
                  value={row.date}
                  onChange={(e) => updateRow(row.key, { date: e.target.value })}
                  className="h-7 w-full rounded-md bg-hf-bar px-2 text-[11px] text-hf-text-4"
                />
              </div>
              <input
                type="number"
                value={row.amount}
                onChange={(e) => updateRow(row.key, { amount: Number(e.target.value) })}
                className="h-8 w-24 shrink-0 rounded-md bg-hf-bar px-2 text-right font-mono text-[13px] text-hf-text"
              />
            </div>
            <div className="flex items-center gap-1.5 pl-6">
              <select
                value={row.direction}
                onChange={(e) => updateRow(row.key, { direction: e.target.value as StatementDraftRow['direction'] })}
                className="h-7 shrink-0 rounded-md bg-hf-bar px-1.5 text-[11px] text-hf-text-2"
              >
                <option value="expense">Расход</option>
                <option value="income">Доход</option>
              </select>
              {row.direction === 'expense' && (
                <select
                  value={row.categoryId}
                  onChange={(e) => updateRow(row.key, { categoryId: e.target.value })}
                  className="h-7 min-w-0 flex-1 rounded-md bg-hf-bar px-1.5 text-[11px] text-hf-text-2"
                >
                  <option value="">Категория</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
              {row.confidence < 0.6 && <span className="shrink-0 rounded-md border border-hf-warn-on-dark px-1.5 py-0.5 text-[11px] text-hf-warn-on-dark">уточнить</span>}
            </div>
          </div>
        ))}
      </div>

      <ActionBar>
        <Action variant="muted" onClick={onCancel}>
          Отмена
        </Action>
        <Action onClick={onSave} disabled={saving || includedCount === 0}>
          {saving ? 'Сохранение...' : `Сохранить (${includedCount})`}
        </Action>
      </ActionBar>
    </>
  )
}

function PaperRowLike({ label }: { label: string }) {
  return <div className="text-[13px] text-hf-ink-soft">{label}</div>
}

/** Same description appearing 2+ times in one statement — a rough, client-side "looks like a subscription" heuristic. */
function detectRecurring(rows: StatementDraftRow[]): string[] {
  const counts = new Map<string, number>()
  for (const r of rows) {
    if (r.direction !== 'expense') continue
    const key = r.description.trim().toLowerCase()
    if (!key) continue
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()].filter(([, n]) => n >= 2).map(([desc]) => desc)
}
