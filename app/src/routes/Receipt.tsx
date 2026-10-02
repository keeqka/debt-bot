import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { FileStack, Plus } from 'lucide-react'
import { CameraReceiptIcon, DeleteIcon } from '@/components/icons/hf'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { Eyebrow, Action, ActionBar } from '@/components/chrome/Chrome'
import { Paper } from '@/components/chrome/Paper'
import { Mascot } from '@/components/Mascot'
import { useReceiptDraft, type StatementDraftRow } from '@/hooks/use-receipt-draft'
import {
  useAddCategory,
  useAddExpense,
  useAddExpensesBulk,
  useAddIncomesBulk,
  useCategories,
  useExpenses,
  useDeleteIncome,
  useIncomes,
  useLogReceiptScan,
  useMonth,
  useMerchantRules,
  useSaveMerchantRules,
  useReceiptScanCount,
  useSubscription,
} from '@/hooks/use-finance-data'
import { useCurrentUserId } from '@/lib/auth'
import { parseReceipt, parseStatement } from '@/lib/api'
import { fileToBase64 } from '@/lib/file-to-base64'
import { findMerchantRule, merchantKey } from '@/lib/merchant'
import { formatMoney, formatDateShort } from '@/lib/format'
import { AddTransactionDialog } from '@/components/finances/AddTransactionDialog'
import { ExpenseDetailSheet } from '@/components/finances/ExpenseDetailSheet'
import { periodOptions, inPeriod, type PeriodOption } from '@/lib/periods'
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

/** «1 чек / 2–4 чека / 5+ чеков» — с учётом 11–14. */
function receiptsWord(n: number) {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'чек'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'чека'
  return 'чеков'
}

/** Чипы фильтра: только категории, где есть хотя бы один расход, крупные суммы первыми. */
function categoryChips(expenses: Expense[], categories: Category[]) {
  const sums = new Map<string, number>()
  for (const e of expenses) {
    if (e.category_id) sums.set(e.category_id, (sums.get(e.category_id) ?? 0) + e.amount)
  }
  return categories
    .filter((c) => sums.has(c.id))
    .map((c) => ({ id: c.id, name: c.name, sum: sums.get(c.id)! }))
    .sort((a, b) => b.sum - a.sum)
}

/**
 * receipt-tool/statement-tool can now suggest a category name that doesn't
 * exist yet instead of forcing everything into "Прочее" — this creates each
 * unique new name exactly once (case-insensitive) at the moment the user
 * hits Save, same as the expense insert itself, never earlier.
 */
async function resolveCategoryIds(
  names: string[],
  existing: Category[],
  addCategory: ReturnType<typeof useAddCategory>,
): Promise<Map<string, string>> {
  const byLower = new Map(existing.map((c) => [c.name.trim().toLowerCase(), c.id]))
  const result = new Map<string, string>()
  for (const raw of names) {
    const key = raw.trim().toLowerCase()
    if (!key || result.has(key)) continue
    const existingId = byLower.get(key)
    if (existingId) {
      result.set(key, existingId)
      continue
    }
    const created = await addCategory.mutateAsync({ name: raw.trim(), icon: 'tag', type: 'expense' })
    byLower.set(key, created.id)
    result.set(key, created.id)
  }
  return result
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
  const addCategory = useAddCategory()
  const { data: rules = [] } = useMerchantRules()
  const saveRules = useSaveMerchantRules()
  const deleteIncome = useDeleteIncome()
  const { data: subscription } = useSubscription()
  const { data: scanCount = 0 } = useReceiptScanCount()
  const logScan = useLogReceiptScan()

  const reduced = useReducedMotion()
  const [openExpenseId, setOpenExpenseId] = useState<string | null>(null)
  const openExpense = expenses?.find((e) => e.id === openExpenseId) ?? null

  const isFreeTier = subscription?.status !== 'active'
  const scansLeft = FREE_TIER_LIMIT - scanCount
  const atScanLimit = isFreeTier && scansLeft <= 0

  const receiptInputRef = useRef<HTMLInputElement>(null)
  const statementInputRef = useRef<HTMLInputElement>(null)
  const [manualOpen, setManualOpen] = useState(searchParams.get('add') === 'manual')

  // Фильтры списка «Последнее» — не сохраняются между сессиями. Месяц (бюджетный,
  // как в настройках) по умолчанию текущий; 'all' — за всё время. Категории в
  // чипах считаются внутри выбранного месяца.
  const month = useMonth()
  const startDay = month?.settings.periodStartDay ?? null
  const periods = useMemo(
    () => periodOptions([...(expenses ?? []).map((e) => e.spent_at), ...(incomes ?? []).map((i) => i.received_at)], startDay),
    [expenses, incomes, startDay],
  )
  const [periodBack, setPeriodBack] = useState<number | 'all'>(0)
  useEffect(() => {
    if (periodBack !== 'all' && !periods.some((p) => p.back === periodBack)) setPeriodBack(0)
  }, [periods, periodBack])
  const period = periodBack === 'all' ? null : (periods.find((p) => p.back === periodBack) ?? periods[0])
  const periodExpenses = useMemo(() => (period ? (expenses ?? []).filter((e) => inPeriod(e.spent_at, period)) : (expenses ?? [])), [expenses, period])
  const periodIncomes = useMemo(() => (period ? (incomes ?? []).filter((i) => inPeriod(i.received_at, period)) : (incomes ?? [])), [incomes, period])

  const [catFilter, setCatFilter] = useState<string>('all')
  const chips = useMemo(() => categoryChips(periodExpenses, categories ?? []), [periodExpenses, categories])
  // Удалили последнюю трату выбранной категории — её чипа больше нет, возвращаемся на «Все».
  useEffect(() => {
    if (catFilter !== 'all' && !chips.some((c) => c.id === catFilter)) setCatFilter('all')
  }, [chips, catFilter])

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
      // Правило магазина сильнее догадки ИИ: один раз поправил — дальше без ошибок.
      const rule = findMerchantRule(rules, result.merchant)
      const ruleCategory = rule && categories?.find((c) => c.id === rule.category_id)
      const matched = ruleCategory ?? categories?.find((c) => c.name.trim().toLowerCase() === result.suggested_category?.trim().toLowerCase())
      setDraft({ status: 'parsed-receipt', result, categoryId: matched?.id ?? '', autoCategoryId: matched?.id ?? '', ruled: !!ruleCategory })
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
      const rows: StatementDraftRow[] = parsed.transactions.map((t) => {
        const rule = t.direction === 'expense' ? findMerchantRule(rules, t.description) : undefined
        const ruleCategoryId = rule && expenseCategories.find((c) => c.id === rule.category_id)?.id
        const categoryId =
          ruleCategoryId ||
          (t.direction === 'expense' &&
            expenseCategories.find((c) => c.name.trim().toLowerCase() === t.suggested_category?.trim().toLowerCase())?.id) ||
          ''
        return { ...t, key: crypto.randomUUID(), included: true, categoryId, autoCategoryId: categoryId, ruled: !!ruleCategoryId }
      })
      setDraft({ status: 'parsed-statement', rows })
    } catch {
      setDraft({ status: 'error', message: 'Не удалось разобрать выписку, попробуй ещё раз.' })
    }
  }

  async function saveReceipt() {
    if (draft.status !== 'parsed-receipt') return
    const { result, categoryId, autoCategoryId } = draft
    let finalCategoryId = categoryId
    if (!finalCategoryId && result.suggested_category) {
      const map = await resolveCategoryIds([result.suggested_category], categories ?? [], addCategory)
      finalCategoryId = map.get(result.suggested_category.trim().toLowerCase()) ?? ''
    }
    await addExpense.mutateAsync({
      user_id: userId,
      amount: result.total_amount ?? 0,
      currency: result.currency ?? 'KZT',
      category_id: finalCategoryId || null,
      merchant: result.merchant,
      spent_at: result.date ?? new Date().toISOString().slice(0, 10),
      description: null,
      source: 'receipt_photo',
      receipt_asset_path: null,
      ai_confidence: result.confidence,
      is_confirmed: true,
    })
    // Пользователь сам выбрал/сменил категорию — запоминаем для этого магазина.
    const key = merchantKey(result.merchant)
    if (key && categoryId && categoryId !== autoCategoryId) {
      await saveRules.mutateAsync([{ merchant_key: key, merchant_label: result.merchant ?? key, category_id: categoryId }])
      toast.success(`Запомнил: «${result.merchant}» — в «${categories?.find((c) => c.id === categoryId)?.name}»`)
    } else {
      toast.success('Расход сохранён')
    }
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
    const newCategoryNames = expenseRows.filter((r) => !r.categoryId && r.suggested_category).map((r) => r.suggested_category!)
    const categoryMap = newCategoryNames.length > 0 ? await resolveCategoryIds(newCategoryNames, categories ?? [], addCategory) : new Map<string, string>()
    // Исправленные вручную категории становятся правилами магазинов (последняя правка по магазину выигрывает).
    const learned = new Map<string, { merchant_key: string; merchant_label: string; category_id: string }>()
    for (const r of expenseRows) {
      const key = merchantKey(r.description)
      if (key && r.categoryId && r.categoryId !== r.autoCategoryId) {
        learned.set(key, { merchant_key: key, merchant_label: r.description, category_id: r.categoryId })
      }
    }
    if (expenseRows.length > 0) {
      await addExpensesBulk.mutateAsync(
        expenseRows.map((r) => ({
          user_id: userId,
          amount: r.amount,
          currency: 'KZT',
          category_id: r.categoryId || (r.suggested_category ? (categoryMap.get(r.suggested_category.trim().toLowerCase()) ?? null) : null),
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
    if (learned.size > 0) await saveRules.mutateAsync([...learned.values()])
    toast.success(`Добавлено операций: ${included.length}${learned.size > 0 ? `, правил магазинов: ${learned.size}` : ''}`)
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

      <AnimatePresence mode="wait">
        {/* uploading/reading share one visual (ReadingView) — grouping them
            under one key avoids a pointless crossfade between two identical
            frames while the file is still being read (ANIMATIONS.md §4). */}
        <motion.div
          key={draft.status === 'uploading' ? 'reading' : draft.status}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.2 }}
          className="space-y-3.5"
        >
          {draft.status === 'idle' && (
            <IdleView
              onReceipt={() => receiptInputRef.current?.click()}
              onStatement={() => statementInputRef.current?.click()}
              onManual={() => setManualOpen(true)}
              expenses={periodExpenses}
              incomes={periodIncomes}
              categories={categories ?? []}
              hasRecords={(expenses?.length ?? 0) + (incomes?.length ?? 0) > 0}
              periods={periods}
              periodBack={periodBack}
              onPeriod={setPeriodBack}
              chips={chips}
              catFilter={catFilter}
              onCatFilter={setCatFilter}
              onOpenExpense={setOpenExpenseId}
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
        </motion.div>
      </AnimatePresence>

      <AddTransactionDialog open={manualOpen} onOpenChange={setManualOpen} />
      <ExpenseDetailSheet expense={openExpense} open={Boolean(openExpense)} onOpenChange={(open) => !open && setOpenExpenseId(null)} />
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
  hasRecords,
  periods,
  periodBack,
  onPeriod,
  chips,
  catFilter,
  onCatFilter,
  onOpenExpense,
  onDeleteIncome,
}: {
  onReceipt: () => void
  onStatement: () => void
  onManual: () => void
  expenses: Expense[]
  incomes: Income[]
  categories: Category[]
  /** Есть ли вообще записи (за любой месяц) — без них фильтров нет. */
  hasRecords: boolean
  periods: PeriodOption[]
  periodBack: number | 'all'
  onPeriod: (back: number | 'all') => void
  chips: Array<{ id: string; name: string; sum: number }>
  catFilter: string
  onCatFilter: (id: string) => void
  onOpenExpense: (id: string) => void
  onDeleteIncome: (id: string) => void
}) {
  const filtering = catFilter !== 'all'
  const filtered = filtering ? expenses.filter((e) => e.category_id === catFilter) : expenses
  const filteredTotal = filtered.reduce((s, e) => s + e.amount, 0)
  const activeName = chips.find((c) => c.id === catFilter)?.name

  const rows = [
    ...filtered.map((e) => ({
      id: e.id,
      type: 'expense' as const,
      amount: e.amount,
      currency: e.currency,
      date: e.spent_at,
      label: e.merchant ?? categories.find((c) => c.id === e.category_id)?.name ?? e.description ?? 'Расход',
      needsReview: !e.is_confirmed,
    })),
    ...(filtering ? [] : incomes).map((i) => ({
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
          <CameraReceiptIcon className="h-4.5 w-4.5" />
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

      {hasRecords && (
        <FilterStrip label="Фильтр по месяцу">
          {[...periods.map((p) => ({ id: p.back, name: p.label })), { id: 'all' as const, name: 'Всё время' }].map((p) => (
            <FilterChip key={p.id} active={periodBack === p.id} onClick={() => onPeriod(p.id)} round>
              {p.name}
            </FilterChip>
          ))}
        </FilterStrip>
      )}

      {chips.length > 0 && (
        <FilterStrip label="Фильтр по категории">
          {[{ id: 'all', name: 'Все' }, ...chips].map((c) => (
            <FilterChip key={c.id} active={catFilter === c.id} onClick={() => onCatFilter(c.id)}>
              {c.name}
            </FilterChip>
          ))}
        </FilterStrip>
      )}

      {hasRecords && (
        <div className="flex items-baseline justify-between gap-3 pt-1">
          <span className="text-[28px] font-bold tracking-[-0.03em] text-hf-text">{formatMoney(filteredTotal)}</span>
          <span className="truncate font-mono text-[11px] text-hf-text-4">
            {filtering ? activeName : 'все категории'} · {filtered.length} {receiptsWord(filtered.length)}
          </span>
        </div>
      )}

      <Eyebrow>{filtering && activeName ? activeName : 'Последнее'}</Eyebrow>
      <div className="flex flex-col gap-2">
        {rows.map((row) =>
          row.type === 'expense' ? (
            <button
              key={`expense-${row.id}`}
              type="button"
              onClick={() => onOpenExpense(row.id)}
              className="flex w-full items-center justify-between gap-2.5 rounded-[14px] bg-hf-card px-3.5 py-3 text-left"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-hf-text">{row.label}</p>
                <p className="text-[11px] text-hf-text-4">{formatDateShort(row.date)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2.5">
                {row.needsReview && (
                  <span className="rounded-md border border-hf-warn-on-dark px-1.5 py-0.5 text-[11px] text-hf-warn-on-dark">уточнить</span>
                )}
                <span className="font-mono text-sm text-hf-text">−{formatMoney(row.amount, row.currency)}</span>
              </div>
            </button>
          ) : (
            <div key={`income-${row.id}`} className="flex items-center justify-between gap-2.5 rounded-[14px] bg-hf-card px-3.5 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-hf-text">{row.label}</p>
                <p className="text-[11px] text-hf-text-4">{formatDateShort(row.date)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2.5">
                <span className="font-mono text-sm text-hf-ok">+{formatMoney(row.amount, row.currency)}</span>
                <button
                  type="button"
                  onClick={() => onDeleteIncome(row.id)}
                  aria-label={`Удалить: ${row.label}`}
                  className="text-hf-text-4"
                >
                  <DeleteIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ),
        )}
        {rows.length === 0 && (
          <p className="py-8 text-center text-[13px] text-hf-text-4">
            {filtering
              ? 'В этой категории пока нет трат'
              : hasRecords
                ? 'В этом месяце записей пока нет'
                : 'Записей пока нет — загрузи первый чек'}
          </p>
        )}
      </div>
    </>
  )
}

/** Горизонтальная полоса чипов: скроллится без полосы прокрутки, прижата к краям экрана. */
function FilterStrip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="no-scrollbar -mx-4 -my-1.5 flex gap-2 overflow-x-auto px-4 py-1.5" role="group" aria-label={label}>
      {children}
    </div>
  )
}

function FilterChip({ active, onClick, round = false, children }: { active: boolean; onClick: () => void; round?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        // before: невидимая зона нажатия до ~48px по высоте при визуальных 36px
        "relative shrink-0 px-3.5 py-2 text-[13px] before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hf-accent",
        round ? 'rounded-full' : 'rounded-[10px]',
        active ? 'bg-hf-accent text-white' : 'bg-hf-card text-hf-text-3',
      )}
    >
      {children}
    </button>
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
          <div
            key={i}
            className="h-3 animate-pulse rounded bg-hf-receipt-line/20"
            style={{ width: `${w}%`, animationDelay: `${i * 150}ms` }}
          />
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
  const reduced = useReducedMotion()
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

  const matchedCategory = categories.find((c) => c.id === categoryId)?.name ?? null
  const isNewCategory = !matchedCategory && !!result.suggested_category
  const categoryName = matchedCategory ?? result.suggested_category ?? null

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

      <AnimatePresence>
        {isDuplicate && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-[12px] bg-hf-receipt-warn px-3.5 py-2.5 text-[13px] text-hf-warn-ink">
              Похоже, этот чек уже загружен — сумма, магазин и дата совпадают с существующей записью.
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Paper className="flex flex-col gap-2.5">
        {items.map((item, i) => (
          <motion.div
            key={i}
            className="flex items-center gap-2 rounded-md text-[13px]"
            // Literal hex, not a var() reference — framer-motion needs an
            // actual color value to interpolate between frames, not a CSS
            // custom property it can't resolve mid-animation.
            initial={!item.name ? { backgroundColor: '#fbefdd' } : false}
            animate={{ backgroundColor: 'rgba(251,239,221,0)' }}
            transition={{ duration: reduced ? 0 : 0.8 }}
          >
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
              <DeleteIcon className="h-3.5 w-3.5" />
            </button>
          </motion.div>
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
          Сохраню в «{categoryName ?? 'без категории'}»{isNewCategory ? ' (новая категория)' : ''} за {formatDateShort(result.date ?? new Date().toISOString())}.
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
                  <option value="">{row.categoryId ? 'Категория' : row.suggested_category ? `+ ${row.suggested_category} (новая)` : 'Категория'}</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
              {row.ruled && row.categoryId === row.autoCategoryId && <span className="shrink-0 font-mono text-[11px] text-hf-text-4">по правилу</span>}
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
