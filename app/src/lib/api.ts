import { isBackendConfigured } from '@/lib/env'
import { callFunction, supabase } from '@/lib/supabase'
import * as mock from '@/lib/mock-data'
import { simulateDebtStrategy } from '@/lib/debt-strategy'
import type {
  BankProduct,
  ChatMessage,
  Debt,
  DebtDraft,
  DebtPayment,
  DebtStrategyKind,
  DebtStrategyPlan,
  Category,
  Expense,
  Goal,
  Income,
  ReceiptParseResult,
  StatusInsight,
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

export async function getDebts(): Promise<Debt[]> {
  if (!isBackendConfigured || !supabase) return mock.mockDebts
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

export async function addDebtPayment(payment: Omit<DebtPayment, 'id'>): Promise<void> {
  if (!isBackendConfigured || !supabase) {
    mock.mockDebtPayments.unshift({ ...payment, id: crypto.randomUUID() })
    const debt = mock.mockDebts.find((d) => d.id === payment.debt_id)
    if (debt) debt.current_balance = Math.max(0, debt.current_balance - payment.amount)
    return
  }
  const { error } = await supabase.from('debt_payments').insert(payment)
  if (error) throw error
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

export async function getDebtStrategy(strategy: DebtStrategyKind, monthlySurplus: number): Promise<DebtStrategyPlan> {
  const debts = await getDebts()
  if (!isBackendConfigured) {
    return simulateDebtStrategy({ debts, monthlySurplus, strategy })
  }
  return callFunction<DebtStrategyPlan>('debts-strategy', { strategy, monthly_surplus: monthlySurplus })
}

export async function getIncomes(): Promise<Income[]> {
  if (!isBackendConfigured || !supabase) return mock.mockIncomes
  const { data, error } = await supabase.from('incomes').select('*').order('received_at', { ascending: false })
  if (error) throw error
  return data as Income[]
}

export async function getExpenses(): Promise<Expense[]> {
  if (!isBackendConfigured || !supabase) return mock.mockExpenses
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

export async function getCategories(): Promise<Category[]> {
  if (!isBackendConfigured || !supabase) return mock.mockCategories
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

export async function deleteCategory(id: string): Promise<void> {
  if (!isBackendConfigured || !supabase) {
    const index = mock.mockCategories.findIndex((c) => c.id === id)
    if (index !== -1) mock.mockCategories.splice(index, 1)
    return
  }
  const { error } = await supabase.from('categories').delete().eq('id', id)
  if (error) throw error
}

export async function getGoals(): Promise<Goal[]> {
  if (!isBackendConfigured || !supabase) return mock.mockGoals
  const { data, error } = await supabase.from('goals').select('*')
  if (error) throw error
  return data as Goal[]
}

export async function addGoal(goal: Omit<Goal, 'id' | 'ai_strategy'>): Promise<Goal> {
  if (!isBackendConfigured || !supabase) {
    const created: Goal = { ...goal, id: crypto.randomUUID(), ai_strategy: null }
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

export async function getStatus(): Promise<StatusInsight> {
  if (!isBackendConfigured) return mock.mockStatus
  return callFunction<StatusInsight>('status', {})
}

export async function parseReceipt(imageBase64: string): Promise<ReceiptParseResult> {
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
  return callFunction<ReceiptParseResult>('receipts-parse', { image_base64: imageBase64 })
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
  if (!isBackendConfigured) return mock.mockChatMessages
  const { data, error } = await supabase!.from('chat_messages').select('*').order('created_at', { ascending: true })
  if (error) throw error
  return data as ChatMessage[]
}

export async function sendChatMessage(content: string): Promise<ChatMessage> {
  if (!isBackendConfigured) {
    mock.mockChatMessages.push({
      id: crypto.randomUUID(),
      user_id: mock.currentMockUser.id,
      role: 'user',
      content,
      created_at: new Date().toISOString(),
    })
    await new Promise((r) => setTimeout(r, 700))
    const reply: ChatMessage = {
      id: crypto.randomUUID(),
      user_id: mock.currentMockUser.id,
      role: 'assistant',
      content:
        'Пока это демо-режим без ключей Claude API — как только подключим бэкенд, здесь будет настоящий ответ на основе ваших реальных доходов, расходов и долгов.',
      created_at: new Date().toISOString(),
    }
    mock.mockChatMessages.push(reply)
    return reply
  }
  return callFunction<ChatMessage>('chat', { content })
}
