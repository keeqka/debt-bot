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
  /** Семья — все данные делятся внутри неё (0017_households_and_invites.sql). */
  household_id: Uuid
  /** Может приглашать новые семьи. */
  is_admin: boolean
  created_at: string
}

/** Сколько мест в приложении и в семье (RPC access_info). */
export interface AccessInfo {
  users: number
  max_users: number
  members: number
  max_members: number
  is_admin: boolean
}

export type InviteKind = 'household' | 'partner'

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
  /** Подушка безопасности — бюджет читает её накопленное как резерв. */
  is_cushion: boolean
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
  /** До какого числа семья поддерживает проект подпиской звёздами (0019). */
  paid_until?: string | null
}

export type DebtStrategyKind = 'avalanche' | 'snowball' | 'cash_flow'

export type PriorityMode = 'debts_first' | 'cushion_first' | 'split' | 'ladder'

/** «Этот магазин — всегда эта категория» (0020_budget_period_and_merchant_rules.sql). */
export interface MerchantRule {
  id: string
  /** Нормализованное название (lib/merchant.ts), по нему ищется совпадение. */
  merchant_key: string
  /** Как магазин выглядел в выписке — для списка в настройках. */
  merchant_label: string
  category_id: string
}

/** Модель денег семьи — одна строка на всех (0016_household_plan_settings.sql). */
export interface HouseholdSettings {
  priority_mode: PriorityMode
  debt_strategy: DebtStrategyKind
  cushion_months: number
  split_debt_pct: number
  high_rate_threshold: number
  /** День, с которого начинается бюджетный месяц (обычно день зарплаты); null — календарный месяц. */
  period_start_day: number | null
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

/** Смена настроек, которую предложил «Чек», и во что она выльется (посчитано сервером той же моделью, что и приложение). */
export interface ProposedSettings {
  household?: Partial<HouseholdSettings>
  user?: Partial<Pick<User, 'monthly_income' | 'payday' | 'daily_reminder_enabled' | 'daily_reminder_time'>>
  /** Чей доход/напоминание меняется — автор сообщения. */
  user_id?: string
  preview?: {
    debt_free_before: string | null
    debt_free_after: string | null
    interest_before: number
    interest_after: number
    cushion_full_before: string | null
    cushion_full_after: string | null
    per_day_before: number
    per_day_after: number
  }
}

export interface ChatDataWidgetRow {
  name: string
  amount: number
  pct: number
}

/** Лицо маскота «Чек» — те же варианты, что умеет components/Mascot.tsx. */
export type MascotExpression = 'calm' | 'focused' | 'happy' | 'alert' | 'thinking'

export interface ChatMessage {
  id: Uuid
  user_id: Uuid
  role: 'user' | 'assistant' | 'tool'
  content: string
  /** Which Claude model produced this reply (assistant messages only). */
  model?: string | null
  proposed_debt?: ProposedDebt | null
  proposed_category?: ProposedCategory | null
  /** Предложенная в чате смена настроек — применяется только по тапу. */
  proposed_settings?: ProposedSettings | null
  /** A numeric breakdown rendered on paper inside the bubble instead of text with percentages (ТЗ FUNCTIONAL.md §6). */
  data_widget?: ChatDataWidgetRow[] | null
  /** 2-3 suggested follow-up questions shown under this message. */
  quick_replies?: string[] | null
  /** С каким лицом «Чек» сказал этот ответ (выбирает сам ИИ); null — ответ из времени до характера. */
  expression?: MascotExpression | null
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
