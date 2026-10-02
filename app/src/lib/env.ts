export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
}

/**
 * Фича-флаги (SPEC-features.md): каждая функция выкатывается отдельно. Включены
 * по умолчанию; выключить — VITE_FF_<ИМЯ>=false в окружении сборки.
 */
const flag = (name: string) => import.meta.env[`VITE_FF_${name}`] !== 'false'
export const features = {
  debtSim: flag('DEBT_SIM'), // 05 · симулятор досрочки
  strategyCompare: flag('STRATEGY_COMPARE'), // 06 · лавина или ком
  preDebtCheck: flag('PRE_DEBT_CHECK'), // 07 · перед новым долгом
  offerParse: flag('OFFER_PARSE'), // 08 · разбор предложения по скриншоту
  settingsGroups: flag('SETTINGS_GROUPS'), // 12 · настройки тремя группами
  forecast: flag('FORECAST'), // 02 · прогноз конца месяца
  stressTest: flag('STRESS_TEST'), // 01 · стресс-тест
  annualExpenses: flag('ANNUAL_EXPENSES'), // 03 · крупные траты года
  budgetModel: flag('BUDGET_MODEL'), // 04 · модель бюджета
  glossary: flag('GLOSSARY'), // 09 · термин на твоих цифрах
  weeklyReview: flag('WEEKLY_REVIEW'), // 10 · разбор недели
  health: flag('HEALTH'), // 11 · финансовое здоровье
}

/** True once real Supabase keys are provided; until then the app runs on mock data. */
export const isBackendConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey)
