export type FinancialStatus = 'green' | 'light_green' | 'yellow' | 'orange' | 'red'

export type Uuid = string

export interface User {
  id: Uuid
  telegram_id: number
  display_name: string
  username: string | null
  avatar_url: string | null
  timezone: string
  /** Set in onboarding step 2 or Профиль — Overview falls back to a facts-only view while this is null. */
  monthly_income: number | null
  payday: number | null
  daily_reminder_enabled: boolean
  daily_reminder_time: string
  vacation_paused: boolean
  onboarding_completed_at: string | null
  created_at: string
}

export type DebtStatus = 'active' | 'closed'

export interface Debt {
  id: Uuid
  owner_user_id: Uuid
  title: string
  creditor: string
  principal_amount: number
  current_balance: number
  currency: string
  interest_rate: number | null
  minimum_payment: number
  due_day: number | null
  status: DebtStatus
  notes: string | null
  created_at: string
}

export interface DebtPayment {
  id: Uuid
  debt_id: Uuid
  amount: number
  paid_at: string
  is_extra: boolean
  note: string | null
}

export interface Income {
  id: Uuid
  user_id: Uuid
  source: string
  amount: number
  currency: string
  received_at: string
  is_recurring: boolean
  recurrence_day: number | null
}

export type ExpenseSource = 'manual' | 'receipt_photo' | 'screenshot' | 'statement'

export interface Expense {
  id: Uuid
  user_id: Uuid
  amount: number
  currency: string
  category_id: Uuid | null
  merchant: string | null
  spent_at: string
  description: string | null
  source: ExpenseSource
  receipt_asset_path: string | null
  ai_confidence: number | null
  is_confirmed: boolean
}

export type CategoryType = 'expense' | 'income'

export interface Category {
  id: Uuid
  name: string
  icon: string
  type: CategoryType
  is_system: boolean
}

export type GoalStatus = 'active' | 'achieved' | 'paused'

export interface GoalStrategy {
  monthly_contribution_needed: number
  estimated_completion_date: string
  bank_product_suggestions: { bank_product_id: Uuid; reasoning: string }[]
  risks: string[]
}

export interface Goal {
  id: Uuid
  title: string
  target_amount: number
  current_amount: number
  target_date: string | null
  currency: string
  status: GoalStatus
  ai_strategy: GoalStrategy | null
}

export interface BankProduct {
  id: Uuid
  bank_name: string
  product_name: string
  type: 'deposit' | 'savings_account'
  rate_percent: number
  term_months: number | null
  min_amount: number | null
  source_url: string
  updated_at: string
}

export interface StatusInsight {
  status: FinancialStatus
  score: number
  headline: string
  key_risks: string[]
  recommendations: string[]
}

export type SubscriptionStatus = 'free' | 'active'

/** One row for the whole household — see 0012_subscription_stub.sql. */
export interface Subscription {
  id: Uuid
  status: SubscriptionStatus
  activated_at: string | null
}

export type DebtStrategyKind = 'avalanche' | 'snowball'

export interface DebtStrategyPlan {
  strategy: DebtStrategyKind
  payoff_order: Uuid[]
  monthly_plan: { debt_id: Uuid; payment: number }[]
  /** null when there's no real payoff date to give (e.g. a minimum payment that doesn't cover its own interest) — never an unparseable placeholder string. */
  estimated_payoff_date: string | null
  total_interest_paid: number
  explanation: string
}

/** What the chat advisor proposed when the user asked it to add a debt — always reviewed in the "Новый долг" form, never auto-saved. */
export interface ProposedDebt {
  title: string
  creditor: string
  principal_amount: number | null
  current_balance: number | null
  interest_rate: number | null
  minimum_payment: number | null
  due_day: number | null
}

/** What the chat advisor proposed when the user asked it to add a category — one tap to actually create it, no form (unlike a debt, there's nothing here worth reviewing first). */
export interface ProposedCategory {
  name: string
  type: CategoryType
}

export interface ChatDataWidgetRow {
  name: string
  amount: number
  pct: number
}

export interface ChatMessage {
  id: Uuid
  user_id: Uuid
  role: 'user' | 'assistant' | 'tool'
  content: string
  /** Which Claude model produced this reply (assistant messages only). */
  model?: string | null
  proposed_debt?: ProposedDebt | null
  proposed_category?: ProposedCategory | null
  /** A numeric breakdown rendered on paper inside the bubble instead of text with percentages (ТЗ FUNCTIONAL.md §6). */
  data_widget?: ChatDataWidgetRow[] | null
  /** 2-3 suggested follow-up questions shown under this message. */
  quick_replies?: string[] | null
  created_at: string
}

export interface ReceiptParseResult {
  is_valid_receipt: boolean
  merchant: string | null
  date: string | null
  total_amount: number | null
  currency: string | null
  line_items: { name: string; amount: number }[]
  suggested_category: string | null
  confidence: number
}

export interface StatementTransaction {
  date: string
  description: string
  amount: number
  direction: 'expense' | 'income'
  suggested_category: string | null
  confidence: number
}

export interface StatementParseResult {
  is_valid_statement: boolean
  transactions: StatementTransaction[]
}

/**
 * AI-assisted draft for the "new debt" form (manually triggered, see ТЗ chat
 * request: fill from a screenshot of a loan, falling back to a web search for
 * anything not visible in the image, e.g. the interest rate).
 */
export interface DebtDraft {
  title: string
  creditor: string
  principal_amount: number | null
  current_balance: number | null
  currency: string
  interest_rate: number | null
  minimum_payment: number | null
  due_day: number | null
  /** true if any field was filled via web search rather than read directly off the screenshot */
  used_web_search: boolean
  /** what was found, from where, and what the user should double-check */
  source_note: string
  confidence: number
}
