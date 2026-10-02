import { isBackendConfigured } from '@/lib/env'
import { callFunction, supabase } from '@/lib/supabase'
import * as mock from '@/lib/mock-data'
import type {
  BankProduct,
  ChatMessage,
  Debt,
  DebtDraft,
  DebtPayment,
  DebtDraw,
  HouseholdSettings,
  AnnualExpense,
  NeedKind,
  HealthOverride,
  HealthItemId,
  Challenge,
  ChallengeKind,
  WeeklyReview,
  MerchantRule,
  AccessInfo,
  InviteKind,
  Category,
  Expense,
  Goal,
  Income,
  ReceiptParseResult,
  StatementParseResult,
  StatusInsight,
  Subscription,
  User,
} from '@/types/domain'

/**
 * Every function here has two branches: real Supabase (once VITE_SUPABASE_*
 * env vars are set) and mock data (so the app is fully usable before keys
 * arrive). Screens should only ever import from this module, never reach
 * into `lib/supabase` or `lib/mock-data` directly.
 */

export async function getUsers(): Promise<User[]> {
  if (!isBackendConfigured || !supabase) return mock.mockUsers
  const { data, error } = await supabase.from('users').select('*')
  if (error) throw error
  return data as User[]
}

export async function updateUser(id: string, patch: Partial<Omit<User, 'id'>>): Promise<User> {
  if (!isBackendConfigured || !supabase) {
    const index = mock.mockUsers.findIndex((u) => u.id === id)
    if (index === -1) throw new Error('User not found')
    // A new object, not Object.assign-in-place: useCurrentUser() is read via
    // setQueryData (not invalidateQueries+refetch, unlike most mock mutations
    // here), so anything downstream memoized on this reference (useMonth's
    // useMemo) needs it to actually change identity to notice the update.
    const updated = { ...mock.mockUsers[index], ...patch }
    mock.mockUsers[index] = updated
    return updated
  }
  const { data, error } = await supabase.from('users').update(patch).eq('id', id).select().single()
  if (error) throw error
  return data as User
}

export async function getDebts(): Promise<Debt[]> {
  // A fresh array copy on every read — mock.mockDebts is mutated in place by
  // add/update/delete below, so returning the same reference would make
  // React Query (and any useMemo keyed on it) think nothing changed and
  // skip re-rendering after a mutation.
  if (!isBackendConfigured || !supabase) return [...mock.mockDebts]
  const { data, error } = await supabase.from('debts').select('*').order('interest_rate', { ascending: false })
  if (error) throw error
  return data as Debt[]
}

export async function getDebtPayments(debtId: string): Promise<DebtPayment[]> {
  if (!isBackendConfigured || !supabase) return mock.mockDebtPayments.filter((p) => p.debt_id === debtId)
  const { data, error } = await supabase.from('debt_payments').select('*').eq('debt_id', debtId).order('paid_at', { ascending: false })
  if (error) throw error
  return data as DebtPayment[]
}

export async function getAllDebtPayments(): Promise<DebtPayment[]> {
  if (!isBackendConfigured || !supabase) return [...mock.mockDebtPayments]
  const { data, error } = await supabase.from('debt_payments').select('*')
  if (error) throw error
  return data as DebtPayment[]
}

export async function addDebtPayment(payment: Omit<DebtPayment, 'id'>): Promise<void> {
  if (!isBackendConfigured || !supabase) {
    mock.mockDebtPayments.unshift({ ...payment, id: crypto.randomUUID() })
    const debt = mock.mockDebts.find((d) => d.id === payment.debt_id)
    if (debt) {
      debt.current_balance = Math.max(0, debt.current_balance - payment.amount)
      // Same as the DB trigger (0015): paying off the balance closes the debt.
      if (debt.current_balance === 0) debt.status = 'closed'
    }
    return
  }
  const { error } = await supabase.from('debt_payments').insert(payment)
  if (error) throw error
}

/** Снятие с кредитной карты: остаток растёт (в БД то же делает триггер 0025; лимит проверяет и он). */
export async function addDebtDraw(draw: Omit<DebtDraw, 'id'>): Promise<void> {
  if (!isBackendConfigured || !supabase) {
    const debt = mock.mockDebts.find((d) => d.id === draw.debt_id)
    if (!debt || debt.kind !== 'credit_card') throw new Error('Снятие доступно только для кредитной карты')
    if (debt.credit_limit != null && debt.current_balance + draw.amount > debt.credit_limit) {
      throw new Error(`Превышен лимит карты: доступно ${Math.max(0, debt.credit_limit - debt.current_balance)}`)
    }
    mock.mockDebtDraws.unshift({ ...draw, id: crypto.randomUUID() })
    debt.current_balance += draw.amount
    debt.principal_amount = Math.max(debt.principal_amount, debt.current_balance)
    debt.status = 'active'
    return
  }
  const { error } = await supabase.from('debt_draws').insert(draw)
  if (error) throw new Error(error.message.replace(/^.*?(Превышен лимит[^"]*)$/, '$1'))
}

export async function addDebt(debt: Omit<Debt, 'id'>): Promise<Debt> {
  if (!isBackendConfigured || !supabase) {
    const created = { ...debt, id: crypto.randomUUID() }
    mock.mockDebts.unshift(created)
    return created
  }
  const { data, error } = await supabase.from('debts').insert(debt).select().single()
  if (error) throw error
  return data as Debt
}

export async function updateDebt(id: string, patch: Partial<Omit<Debt, 'id'>>): Promise<Debt> {
  if (!isBackendConfigured || !supabase) {
    const debt = mock.mockDebts.find((d) => d.id === id)
    if (!debt) throw new Error('Debt not found')
    Object.assign(debt, patch)
    return debt
  }
  const { data, error } = await supabase.from('debts').update(patch).eq('id', id).select().single()
  if (error) throw error
  return data as Debt
}

/** Hard delete — payment history cascades with it (FK on debt_payments). Frontend always confirms first. */
export async function deleteDebt(id: string): Promise<void> {
  if (!isBackendConfigured || !supabase) {
    const index = mock.mockDebts.findIndex((d) => d.id === id)
    if (index !== -1) mock.mockDebts.splice(index, 1)
    return
  }
  const { error } = await supabase.from('debts').delete().eq('id', id)
  if (error) throw error
}

/**
 * AI-assisted "new debt" form fill (manually triggered by a button, never
 * automatic): send a screenshot and/or a text hint, get back a draft to
 * review before saving. Falls back to web search server-side for anything
 * not visible in the image (e.g. a bank's typical rate) — see
 * supabase/functions/debts-assist.
 */
export async function assistDebtDraft(input: { imageBase64?: string; mediaType?: string; textHint?: string }): Promise<DebtDraft> {
  if (!isBackendConfigured) {
    await new Promise((r) => setTimeout(r, 1200))
    return {
      title: 'Потребительский кредит',
      creditor: 'Bank RBK',
      principal_amount: 850_000,
      current_balance: 850_000,
      currency: 'KZT',
      interest_rate: 21.5,
      minimum_payment: 62_000,
      due_day: 15,
      used_web_search: true,
      source_note:
        'Демо-режим: сумма и день платежа — со «скриншота», ставка 21.5% не была видна на изображении и подставлена как типичная для похожих продуктов Bank RBK — обязательно проверьте перед сохранением.',
      confidence: 0.72,
    }
  }
  return callFunction<DebtDraft>('debts-assist', { image_base64: input.imageBase64, media_type: input.mediaType, text_hint: input.textHint })
}

export async function getIncomes(): Promise<Income[]> {
  if (!isBackendConfigured || !supabase) return [...mock.mockIncomes]
  const { data, error } = await supabase.from('incomes').select('*').order('received_at', { ascending: false })
  if (error) throw error
  return data as Income[]
}

export async function getExpenses(): Promise<Expense[]> {
  if (!isBackendConfigured || !supabase) return [...mock.mockExpenses]
  const { data, error } = await supabase.from('expenses').select('*').order('spent_at', { ascending: false })
  if (error) throw error
  return data as Expense[]
}

export async function addExpense(expense: Omit<Expense, 'id'>): Promise<Expense> {
  if (!isBackendConfigured || !supabase) {
    const created = { ...expense, id: crypto.randomUUID() }
    mock.mockExpenses.unshift(created)
    return created
  }
  const { data, error } = await supabase.from('expenses').insert(expense).select().single()
  if (error) throw error
  return data as Expense
}

export async function addIncome(income: Omit<Income, 'id'>): Promise<Income> {
  if (!isBackendConfigured || !supabase) {
    const created = { ...income, id: crypto.randomUUID() }
    mock.mockIncomes.unshift(created)
    return created
  }
  const { data, error } = await supabase.from('incomes').insert(income).select().single()
  if (error) throw error
  return data as Income
}

/** Bulk variants for statement import (ТЗ chat request: "по банковской выписке добавить траты") — one round trip for the whole reviewed batch instead of N. */
export async function addExpensesBulk(expenses: Omit<Expense, 'id'>[]): Promise<Expense[]> {
  if (expenses.length === 0) return []
  if (!isBackendConfigured || !supabase) {
    const created = expenses.map((e) => ({ ...e, id: crypto.randomUUID() }))
    mock.mockExpenses.unshift(...created)
    return created
  }
  const { data, error } = await supabase.from('expenses').insert(expenses).select()
  if (error) throw error
  return data as Expense[]
}

export async function addIncomesBulk(incomes: Omit<Income, 'id'>[]): Promise<Income[]> {
  if (incomes.length === 0) return []
  if (!isBackendConfigured || !supabase) {
    const created = incomes.map((i) => ({ ...i, id: crypto.randomUUID() }))
    mock.mockIncomes.unshift(...created)
    return created
  }
  const { data, error } = await supabase.from('incomes').insert(incomes).select()
  if (error) throw error
  return data as Income[]
}

export async function deleteExpense(id: string): Promise<void> {
  if (!isBackendConfigured || !supabase) {
    const index = mock.mockExpenses.findIndex((e) => e.id === id)
    if (index !== -1) mock.mockExpenses.splice(index, 1)
    return
  }
  const { error } = await supabase.from('expenses').delete().eq('id', id)
  if (error) throw error
}

/** Одна категория для пачки трат — применение правила магазина к уже записанным. */
export async function updateExpensesCategory(ids: string[], categoryId: string): Promise<void> {
  if (ids.length === 0) return
  if (!isBackendConfigured || !supabase) {
    for (const e of mock.mockExpenses) if (ids.includes(e.id)) e.category_id = categoryId
    return
  }
  const { error } = await supabase.from('expenses').update({ category_id: categoryId }).in('id', ids)
  if (error) throw error
}

/** Bulk-wipe, gated behind a type-to-confirm dialog in ProfilePanel — RLS scopes this to the caller's own household. */
export async function deleteAllExpenses(): Promise<void> {
  if (!isBackendConfigured || !supabase) {
    mock.mockExpenses.length = 0
    return
  }
  const { error } = await supabase.from('expenses').delete().not('id', 'is', null)
  if (error) throw error
}

export async function updateExpense(id: string, patch: Partial<Omit<Expense, 'id' | 'user_id'>>): Promise<Expense> {
  if (!isBackendConfigured || !supabase) {
    const index = mock.mockExpenses.findIndex((e) => e.id === id)
    if (index === -1) throw new Error('Трата не найдена')
    mock.mockExpenses[index] = { ...mock.mockExpenses[index], ...patch }
    return mock.mockExpenses[index]
  }
  const { data, error } = await supabase.from('expenses').update(patch).eq('id', id).select().single()
  if (error) throw error
  return data as Expense
}

export async function deleteIncome(id: string): Promise<void> {
  if (!isBackendConfigured || !supabase) {
    const index = mock.mockIncomes.findIndex((i) => i.id === id)
    if (index !== -1) mock.mockIncomes.splice(index, 1)
    return
  }
  const { error } = await supabase.from('incomes').delete().eq('id', id)
  if (error) throw error
}

export async function getCategories(): Promise<Category[]> {
  if (!isBackendConfigured || !supabase) return [...mock.mockCategories]
  const { data, error } = await supabase.from('categories').select('*')
  if (error) throw error
  return data as Category[]
}

export async function addCategory(category: Omit<Category, 'id' | 'is_system'>): Promise<Category> {
  if (!isBackendConfigured || !supabase) {
    const created: Category = { ...category, id: crypto.randomUUID(), is_system: false }
    mock.mockCategories.push(created)
    return created
  }
  const { data, error } = await supabase.from('categories').insert({ ...category, is_system: false }).select().single()
  if (error) throw error
  return data as Category
}

export async function getMerchantRules(): Promise<MerchantRule[]> {
  if (!isBackendConfigured || !supabase) return [...mock.mockMerchantRules]
  const { data, error } = await supabase.from('merchant_rules').select('id, merchant_key, merchant_label, category_id').order('created_at')
  if (error) throw error
  return data as MerchantRule[]
}

/** Новое правило или смена категории у существующего — ключ магазина один на семью. */
export async function saveMerchantRules(rules: Omit<MerchantRule, 'id'>[]): Promise<void> {
  if (rules.length === 0) return
  if (!isBackendConfigured || !supabase) {
    for (const r of rules) {
      const existing = mock.mockMerchantRules.find((m) => m.merchant_key === r.merchant_key)
      if (existing) Object.assign(existing, r)
      else mock.mockMerchantRules.push({ ...r, id: crypto.randomUUID() })
    }
    return
  }
  const { error } = await supabase.from('merchant_rules').upsert(rules, { onConflict: 'household_id,merchant_key' })
  if (error) throw error
}

export async function deleteMerchantRule(id: string): Promise<void> {
  if (!isBackendConfigured || !supabase) {
    const index = mock.mockMerchantRules.findIndex((r) => r.id === id)
    if (index !== -1) mock.mockMerchantRules.splice(index, 1)
    return
  }
  const { error } = await supabase.from('merchant_rules').delete().eq('id', id)
  if (error) throw error
}

export async function deleteCategory(id: string): Promise<void> {
  if (!isBackendConfigured || !supabase) {
    const index = mock.mockCategories.findIndex((c) => c.id === id)
    if (index !== -1) mock.mockCategories.splice(index, 1)
    return
  }
  const { error } = await supabase.from('categories').delete().eq('id', id)
  if (error) throw error
}

export async function getAnnualExpenses(): Promise<AnnualExpense[]> {
  if (!isBackendConfigured || !supabase) return [...mock.mockAnnualExpenses]
  const { data, error } = await supabase.from('annual_expenses').select('id, title, amount, month, saved').order('month', { ascending: true })
  if (error) throw error
  return (data ?? []).map((a) => ({ ...a, amount: Number(a.amount), saved: Number(a.saved) })) as AnnualExpense[]
}

export async function addAnnualExpense(expense: Omit<AnnualExpense, 'id'>): Promise<AnnualExpense> {
  if (!isBackendConfigured || !supabase) {
    const created = { ...expense, id: crypto.randomUUID() }
    mock.mockAnnualExpenses.push(created)
    return created
  }
  const { data, error } = await supabase.from('annual_expenses').insert(expense).select('id, title, amount, month, saved').single()
  if (error) throw error
  return { ...data, amount: Number(data.amount), saved: Number(data.saved) } as AnnualExpense
}

export async function updateAnnualExpense(id: string, patch: Partial<Omit<AnnualExpense, 'id'>>): Promise<void> {
  if (!isBackendConfigured || !supabase) {
    const i = mock.mockAnnualExpenses.findIndex((a) => a.id === id)
    if (i !== -1) mock.mockAnnualExpenses[i] = { ...mock.mockAnnualExpenses[i], ...patch }
    return
  }
  const { error } = await supabase.from('annual_expenses').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteAnnualExpense(id: string): Promise<void> {
  if (!isBackendConfigured || !supabase) {
    const i = mock.mockAnnualExpenses.findIndex((a) => a.id === id)
    if (i !== -1) mock.mockAnnualExpenses.splice(i, 1)
    return
  }
  const { error } = await supabase.from('annual_expenses').delete().eq('id', id)
  if (error) throw error
}

export async function updateCategoryNeedKind(id: string, needKind: NeedKind): Promise<void> {
  if (!isBackendConfigured || !supabase) {
    const c = mock.mockCategories.find((x) => x.id === id)
    if (c) c.need_kind = needKind
    return
  }
  const { error } = await supabase.from('categories').update({ need_kind: needKind }).eq('id', id)
  if (error) throw error
}

export async function getHealthOverrides(): Promise<HealthOverride[]> {
  if (!isBackendConfigured || !supabase) return [...mock.mockHealthOverrides]
  const { data, error } = await supabase.from('health_overrides').select('item, status')
  if (error) throw error
  return (data ?? []) as HealthOverride[]
}

/** status null — снять пометку. */
export async function setHealthOverride(item: HealthItemId, status: 'na' | 'done' | null): Promise<void> {
  if (!isBackendConfigured || !supabase) {
    const i = mock.mockHealthOverrides.findIndex((o) => o.item === item)
    if (i !== -1) mock.mockHealthOverrides.splice(i, 1)
    if (status) mock.mockHealthOverrides.push({ item, status })
    return
  }
  if (status === null) {
    const { error } = await supabase.from('health_overrides').delete().eq('item', item)
    if (error) throw error
    return
  }
  const { error } = await supabase.from('health_overrides').upsert({ item, status }, { onConflict: 'household_id,item' })
  if (error) throw error
}

export async function getChallenges(): Promise<Challenge[]> {
  if (!isBackendConfigured || !supabase) return [...mock.mockChallenges]
  const { data, error } = await supabase.from('challenges').select('*').order('started_at', { ascending: false }).limit(20)
  if (error) throw error
  return (data ?? []).map((c) => ({ ...c, est_saving: Number(c.est_saving) })) as Challenge[]
}

export async function startChallenge(input: { kind: ChallengeKind; days: number; est_saving: number; payload?: Record<string, unknown> }): Promise<void> {
  const ends_at = new Date(Date.now() + input.days * 86_400_000).toISOString()
  if (!isBackendConfigured || !supabase) {
    mock.mockChallenges.unshift({
      id: crypto.randomUUID(),
      user_id: mock.currentMockUser.id,
      kind: input.kind,
      started_at: new Date().toISOString(),
      ends_at,
      status: 'active',
      est_saving: input.est_saving,
      payload: input.payload ?? {},
    })
    return
  }
  const { error } = await supabase.from('challenges').insert({ kind: input.kind, ends_at, est_saving: input.est_saving, payload: input.payload ?? {} })
  if (error) throw error
}

export async function setChallengeStatus(id: string, status: Challenge['status']): Promise<void> {
  if (!isBackendConfigured || !supabase) {
    const c = mock.mockChallenges.find((x) => x.id === id)
    if (c) c.status = status
    return
  }
  const { error } = await supabase.from('challenges').update({ status }).eq('id', id)
  if (error) throw error
}

/** Последний разбор недели от бота (ai_insights.type = 'weekly_review'); null — ещё не приходил. */
export async function getLatestWeeklyReview(): Promise<WeeklyReview | null> {
  if (!isBackendConfigured || !supabase) {
    return {
      week_of: new Date().toISOString().slice(0, 10),
      win: 'Еда: 74 000 ₸ вместо обычных 96 000 — на 22 000 меньше.',
      fix: 'В «Прочем» накопилось 38 000 ₸ без понятной категории — разнеси их, и бюджет станет точнее.',
      milestone: { pct: 20, text: 'Закрыто 20% долгов от начала — осталось 80%.' },
      challenges: [
        { kind: 'no_delivery', est_saving: 15_000 },
        { kind: 'coffee_home', est_saving: 6_000 },
      ],
      milestone_level: 2,
    }
  }
  const { data, error } = await supabase.from('ai_insights').select('payload').eq('type', 'weekly_review').order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw error
  return (data?.payload as WeeklyReview | undefined) ?? null
}

export async function getGoals(): Promise<Goal[]> {
  if (!isBackendConfigured || !supabase) return [...mock.mockGoals]
  const { data, error } = await supabase.from('goals').select('*')
  if (error) throw error
  return data as Goal[]
}

export async function addGoal(goal: Omit<Goal, 'id' | 'ai_strategy' | 'is_cushion'> & { is_cushion?: boolean }): Promise<Goal> {
  if (!isBackendConfigured || !supabase) {
    const created: Goal = { is_cushion: false, ...goal, id: crypto.randomUUID(), ai_strategy: null }
    mock.mockGoals.unshift(created)
    return created
  }
  const { data, error } = await supabase.from('goals').insert({ ...goal, ai_strategy: null }).select().single()
  if (error) throw error
  return data as Goal
}

export async function updateGoal(id: string, patch: Partial<Omit<Goal, 'id'>>): Promise<Goal> {
  if (!isBackendConfigured || !supabase) {
    const goal = mock.mockGoals.find((g) => g.id === id)
    if (!goal) throw new Error('Goal not found')
    Object.assign(goal, patch)
    return goal
  }
  const { data, error } = await supabase.from('goals').update(patch).eq('id', id).select().single()
  if (error) throw error
  return data as Goal
}

export async function getBankProducts(): Promise<BankProduct[]> {
  if (!isBackendConfigured || !supabase) return mock.mockBankProducts
  const { data, error } = await supabase.from('bank_products').select('*').order('rate_percent', { ascending: false })
  if (error) throw error
  return data as BankProduct[]
}

/**
 * Pure read — never calls Claude. The status card only ever gets a fresh AI
 * computation from the weekly cron or the explicit "Обновить" button
 * (refreshStatus below); opening/navigating the app just reads whatever was
 * last stored, so it costs nothing no matter how often it's called.
 */
export async function getStatus(): Promise<StatusInsight | null> {
  if (!isBackendConfigured || !supabase) return mock.mockStatus
  const { data, error } = await supabase
    .from('ai_insights')
    .select('payload')
    .eq('type', 'status')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return (data?.payload as StatusInsight) ?? null
}

/** Manually triggered recompute (ТЗ: only the weekly cron and this button ever call Claude for status). */
export async function refreshStatus(): Promise<StatusInsight> {
  if (!isBackendConfigured) {
    await new Promise((r) => setTimeout(r, 600))
    return mock.mockStatus
  }
  return callFunction<StatusInsight>('status', {})
}

export async function parseReceipt(imageBase64: string, mediaType = 'image/jpeg'): Promise<ReceiptParseResult> {
  if (!isBackendConfigured) {
    // Mock mode: pretend the photo was Magnum groceries so the confirm screen is demo-able.
    await new Promise((r) => setTimeout(r, 900))
    return {
      is_valid_receipt: true,
      merchant: 'Magnum',
      date: new Date().toISOString().slice(0, 10),
      total_amount: 14_250,
      currency: 'KZT',
      line_items: [
        { name: 'Молоко 2.5%', amount: 890 },
        { name: 'Хлеб', amount: 420 },
        { name: 'Курица охл.', amount: 4_200 },
      ],
      suggested_category: 'Продукты',
      confidence: 0.91,
    }
  }
  return callFunction<ReceiptParseResult>('receipts-parse', { image_base64: imageBase64, media_type: mediaType })
}

export async function parseStatement(fileBase64: string, mediaType = 'application/pdf'): Promise<StatementParseResult> {
  if (!isBackendConfigured) {
    // Mock mode: a small demo statement so the review screen is clickable.
    await new Promise((r) => setTimeout(r, 1400))
    const today = new Date().toISOString().slice(0, 10)
    return {
      is_valid_statement: true,
      transactions: [
        { date: today, description: 'Magnum', amount: 12_400, direction: 'expense', suggested_category: 'Продукты', confidence: 0.9 },
        { date: today, description: 'InDrive', amount: 2_100, direction: 'expense', suggested_category: 'Транспорт', confidence: 0.85 },
        { date: today, description: 'Kaspi Gold пополнение — Зарплата', amount: 450_000, direction: 'income', suggested_category: null, confidence: 0.95 },
        { date: today, description: 'Wolt', amount: 6_800, direction: 'expense', suggested_category: 'Развлечения', confidence: 0.7 },
      ],
    }
  }
  return callFunction<StatementParseResult>('statement-parse', { file_base64: fileBase64, media_type: mediaType })
}

export async function categorizeExpense(input: { description: string; merchant: string | null; amount: number }): Promise<{
  category_id: string | null
  confidence: number
}> {
  if (!isBackendConfigured) {
    return { category_id: null, confidence: 0 }
  }
  return callFunction('expenses-categorize', input)
}

export async function getChatMessages(): Promise<ChatMessage[]> {
  if (!isBackendConfigured) return [...mock.mockChatMessages]
  const { data, error } = await supabase!.from('chat_messages').select('*').order('created_at', { ascending: true })
  if (error) throw error
  return data as ChatMessage[]
}

export async function sendChatMessage(input: string | { content: string; image?: { base64: string; mediaType: string } }): Promise<ChatMessage> {
  const content = typeof input === 'string' ? input : input.content
  const image = typeof input === 'string' ? undefined : input.image
  if (!isBackendConfigured) {
    mock.mockChatMessages.push({
      id: crypto.randomUUID(),
      user_id: mock.currentMockUser.id,
      role: 'user',
      content,
      created_at: new Date().toISOString(),
    })
    await new Promise((r) => setTimeout(r, 700))

    if (image) {
      // Демо: как будто на скриншоте предложение кредитной карты.
      const reply: ChatMessage = {
        id: crypto.randomUUID(),
        user_id: mock.currentMockUser.id,
        role: 'assistant',
        content: 'По платежам выходит 38,2% годовых — дороже твоей кредитки (30%). Основное в карточке ниже: комиссия и страховка поднимают ставку.',
        model: 'claude-sonnet-5',
        expression: 'alert',
        card: {
          kind: 'offer',
          offer: {
            product: 'Кредит наличными',
            amount: 500_000,
            term_months: 24,
            monthly_payment: 28_900,
            nominal_rate: 29.9,
            effective_rate: 38.2,
            effective_rate_computed: true,
            promo_period_months: null,
            rate_after_promo: null,
            fees: [{ name: 'Комиссия за выдачу', amount: 15_000, kind: 'upfront' }],
            insurance_monthly: 2_400,
            total_overpay: 270_600,
          },
          compare: { debt_title: 'Кредитная карта', rate: 30, balance: 480_000, min_payment: 22_000 },
        },
        quick_replies: ['Что такое ГЭСВ?', 'Как отказаться от страховки'],
        created_at: new Date().toISOString(),
      }
      mock.mockChatMessages.push(reply)
      return reply
    }

    const wantsSettings = /режим|подушк|стратеги|снежн|лавин|настройк/i.test(content)
    const closedDebt = /закрыл|погасил/i.test(content)
    const wantsDebt = !closedDebt && /долг|кредит|рассрочк/i.test(content)
    const wantsCategory = /категори/i.test(content)
    const wantsBreakdown = /сколько.*(трачу|уходит)|на что.*деньги|разбивк/i.test(content)
    const reply: ChatMessage = wantsSettings
      ? {
          id: crypto.randomUUID(),
          user_id: mock.currentMockUser.id,
          role: 'assistant',
          content: 'Сначала подушка на 3 месяца, потом долги. Долги закроются позже, зато будет резерв на случай потери дохода. Применить?',
          model: 'claude-sonnet-5',
          expression: 'focused',
          proposed_settings: {
            household: { priority_mode: 'cushion_first', cushion_months: 3 },
            preview: {
              debt_free_before: '2026-12-27',
              debt_free_after: '2027-03-27',
              interest_before: 118_000,
              interest_after: 141_000,
              cushion_full_before: '2027-01-27',
              cushion_full_after: '2026-11-27',
              per_day_before: 10_770,
              per_day_after: 10_770,
            },
          },
          created_at: new Date().toISOString(),
        }
      : closedDebt
      ? {
          id: crypto.randomUUID(),
          user_id: mock.currentMockUser.id,
          role: 'assistant',
          content: 'Долг закрыт. Его минимальный платёж освободился — теперь он идёт в следующий долг. Запиши последний платёж во вкладке «План», чтобы план пересчитался.',
          model: 'claude-sonnet-5',
          expression: 'happy',
          created_at: new Date().toISOString(),
        }
      : wantsDebt
      ? {
          id: crypto.randomUUID(),
          user_id: mock.currentMockUser.id,
          role: 'assistant',
          content: 'Демо-режим: похоже на долг — проверь цифры и подтверди в форме.',
          model: 'claude-sonnet-5',
          expression: 'focused',
          proposed_debt: {
            title: 'Новый долг (демо)',
            creditor: 'Из чата',
            principal_amount: 200_000,
            current_balance: 200_000,
            interest_rate: null,
            minimum_payment: null,
            due_day: null,
          },
          quick_replies: ['Какая ставка обычно у такого долга?', 'Добавь ещё один долг'],
          created_at: new Date().toISOString(),
        }
      : wantsCategory
        ? {
            id: crypto.randomUUID(),
            user_id: mock.currentMockUser.id,
            role: 'assistant',
            content: 'Добавить такую категорию?',
            model: 'claude-sonnet-5',
            expression: 'focused',
            proposed_category: { name: 'Подписки (демо)', type: 'expense' },
            created_at: new Date().toISOString(),
          }
        : wantsBreakdown
        ? {
            id: crypto.randomUUID(),
            user_id: mock.currentMockUser.id,
            role: 'assistant',
            content: 'Вот на что ушли деньги за сентябрь:',
            model: 'claude-sonnet-5',
            expression: 'calm',
            data_widget: [
              { name: 'Жильё', amount: 210_000, pct: 76 },
              { name: 'Здоровье', amount: 32_000, pct: 12 },
              { name: 'Продукты', amount: 18_400, pct: 7 },
            ],
            quick_replies: ['А в прошлом месяце?', 'Поставь лимит на продукты'],
            created_at: new Date().toISOString(),
          }
        : {
            id: crypto.randomUUID(),
            user_id: mock.currentMockUser.id,
            role: 'assistant',
            content:
              'Это демо без Claude API. С бэкендом здесь будет настоящий ответ по твоим доходам, тратам и долгам.',
            model: 'claude-sonnet-5',
            expression: 'calm',
            quick_replies: ['Сколько я трачу на еду?', 'Как быстрее закрыть долги?'],
            created_at: new Date().toISOString(),
          }
    mock.mockChatMessages.push(reply)
    return reply
  }
  return callFunction<ChatMessage>('chat', { content, ...(image ? { image_base64: image.base64, media_type: image.mediaType } : {}) })
}

/** Wipes the whole shared thread (both household members see the same chat, so this clears it for everyone) — always gated behind a confirm dialog. */
export async function clearChatMessages(): Promise<void> {
  if (!isBackendConfigured || !supabase) {
    mock.mockChatMessages.length = 0
    return
  }
  const { error } = await supabase.from('chat_messages').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (error) throw error
}

/** One row for the whole household (0012_subscription_stub.sql) — always the single seeded row, never created from application code. */
export async function getHouseholdSettings(): Promise<HouseholdSettings> {
  if (!isBackendConfigured || !supabase) return { ...mock.mockHouseholdSettings }
  const { data, error } = await supabase
    .from('household_settings')
    .select('priority_mode, debt_strategy, cushion_months, split_debt_pct, high_rate_threshold, period_start_day, pause_threshold, pause_hours, windfall_to_debt_pct, forecast_mode, budget_model')
    .maybeSingle() // RLS: only this family's row
  if (error) throw error
  if (!data) return { ...mock.mockHouseholdSettings } // same values as the table defaults
  return {
    ...data,
    cushion_months: Number(data.cushion_months),
    high_rate_threshold: Number(data.high_rate_threshold),
    pause_threshold: data.pause_threshold == null ? null : Number(data.pause_threshold),
  } as HouseholdSettings
}

export async function updateHouseholdSettings(patch: Partial<HouseholdSettings>): Promise<HouseholdSettings> {
  if (!isBackendConfigured || !supabase) {
    Object.assign(mock.mockHouseholdSettings, patch)
    return { ...mock.mockHouseholdSettings }
  }
  // Upsert: one row per family, keyed by household_id (filled from the session by default).
  const { error } = await supabase.from('household_settings').upsert({ ...patch, updated_at: new Date().toISOString() }, { onConflict: 'household_id' })
  if (error) throw error
  return getHouseholdSettings()
}

/** «Выписка» — HTML-чек (supabase/functions/report); link: true делает временную ссылку на хосте мини-аппа. */
export async function getReportHtml(): Promise<string> {
  if (!isBackendConfigured) {
    return '<!doctype html><meta charset="utf-8"><body style="font:14px monospace;padding:24px;background:#F6F1E8">Выписка собирается на сервере — в демо-режиме её нет.</body>'
  }
  const { html } = await callFunction<{ html: string }>('report', {})
  return html
}

export async function createReportLink(): Promise<{ url: string; downloadUrl: string; expiresAt: string }> {
  if (!isBackendConfigured) throw new Error('Ссылки на выписку работают только с сервером')
  const { url, download_url, expires_at } = await callFunction<{ url: string; download_url: string; expires_at: string }>('report', { link: true })
  return { url, downloadUrl: download_url, expiresAt: expires_at }
}

/** «Напомнить через N ч» перед крупным долгом: строка в reminders, отправит cron-daily-reminder (раз в час). */
export async function createReminder(reminder: { fire_at: string; kind: 'pause_purchase'; payload: Record<string, unknown> }): Promise<void> {
  if (!isBackendConfigured || !supabase) return
  const { error } = await supabase.from('reminders').insert(reminder)
  if (error) throw error
}

/** Stars subscription invoice link (stars-invoice) — opened with Telegram.WebApp.openInvoice. */
export async function createStarsInvoice(): Promise<string> {
  if (!isBackendConfigured) throw new Error('Оплата работает только в Telegram')
  const { url } = await callFunction<{ url: string }>('stars-invoice', {})
  return url
}

export async function getAccessInfo(): Promise<AccessInfo> {
  if (!isBackendConfigured || !supabase) {
    return { users: mock.mockUsers.length, max_users: 5, members: mock.mockUsers.length, max_members: 2, is_admin: true }
  }
  const { data, error } = await supabase.rpc('access_info')
  if (error) throw error
  return data as AccessInfo
}

/** One-time invite code (0017): 'partner' — into your family, 'household' — a new family (admins only). */
export async function createInvite(kind: InviteKind): Promise<string> {
  if (!isBackendConfigured || !supabase) return 'demo0000invite00'
  const { data, error } = await supabase.rpc('create_invite', { p_kind: kind })
  if (error) throw new Error(inviteErrorText(error.message))
  return data as string
}

const INVITE_ERRORS: Record<string, string> = {
  limit_reached: 'Мест нет — лимит людей в приложении исчерпан',
  family_full: 'В семье уже двое',
  forbidden: 'Новые семьи приглашает только админ',
}

function inviteErrorText(message: string) {
  const code = Object.keys(INVITE_ERRORS).find((c) => message.includes(c))
  return code ? INVITE_ERRORS[code] : 'Не получилось создать приглашение'
}

export async function getSubscription(): Promise<Subscription> {
  if (!isBackendConfigured || !supabase) return { ...mock.mockSubscription }
  const { data, error } = await supabase.from('subscriptions').select('*').limit(1).single()
  if (error) throw error
  return data as Subscription
}

/** UI-only stub (no real payment yet, confirmed decision) — just flips the household row to active. */
export async function activateSubscription(): Promise<Subscription> {
  if (!isBackendConfigured || !supabase) {
    mock.mockSubscription.status = 'active'
    mock.mockSubscription.activated_at = new Date().toISOString()
    return { ...mock.mockSubscription }
  }
  // Exactly one row ever exists (seeded once in 0012_subscription_stub.sql,
  // never inserted again) — no id to filter by, so this updates it unconditionally.
  const { data, error } = await supabase
    .from('subscriptions')
    .update({ status: 'active', activated_at: new Date().toISOString() })
    .select()
    .single()
  if (error) throw error
  return data as Subscription
}

/** Logs one parse attempt (receipt or statement, success or failure) against the free-tier limit. */
export async function logReceiptScan(userId: string): Promise<void> {
  if (!isBackendConfigured || !supabase) {
    mock.mockReceiptScans.push(new Date().toISOString())
    return
  }
  const { error } = await supabase.from('receipt_scans').insert({ user_id: userId })
  if (error) throw error
}

/** Count of parse attempts so far this calendar month — the free-tier limit resets monthly, same cadence as Overview's budget. */
export async function getReceiptScanCountThisMonth(): Promise<number> {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  if (!isBackendConfigured || !supabase) {
    return mock.mockReceiptScans.filter((iso) => iso >= monthStart).length
  }
  const { count, error } = await supabase
    .from('receipt_scans')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', monthStart)
  if (error) throw error
  return count ?? 0
}
