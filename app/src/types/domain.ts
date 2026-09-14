export type FinancialStatus = 'green' | 'light_green' | 'yellow' | 'orange' | 'red'

export type Uuid = string

export interface User {
  id: Uuid
  telegram_id: number
  display_name: string
  username: string | null
  avatar_url: string | null
  timezone: string
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

export type ExpenseSource = 'manual' | 'receipt_photo' | 'screenshot'

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

export type DebtStrategyKind = 'optimal' | 'aggressive'

export interface DebtStrategyPlan {
  strategy: DebtStrategyKind
  payoff_order: Uuid[]
  monthly_plan: { debt_id: Uuid; payment: number }[]
  estimated_payoff_date: string
  total_interest_paid: number
  explanation: string
}

export interface ChatMessage {
  id: Uuid
  user_id: Uuid
  role: 'user' | 'assistant' | 'tool'
  content: string
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
