import { computeBudget, type BudgetInput, type PlanSettings } from '@/lib/budget'
import type { HouseholdSettings, ProposedSettings } from '@/types/domain'

/** Поля настроек семьи → поля PlanSettings, которые читает бюджет. */
function planOverrides(change: Partial<HouseholdSettings>): Partial<PlanSettings> {
  return {
    ...(change.priority_mode ? { mode: change.priority_mode } : {}),
    ...(change.debt_strategy ? { strategy: change.debt_strategy } : {}),
    ...(change.cushion_months != null ? { cushionMonths: Number(change.cushion_months) } : {}),
    ...(change.split_debt_pct != null ? { splitDebtPct: change.split_debt_pct } : {}),
    ...(change.high_rate_threshold != null ? { highRateThreshold: Number(change.high_rate_threshold) } : {}),
    ...(change.period_start_day !== undefined ? { periodStartDay: change.period_start_day } : {}),
  }
}

/**
 * Что изменится в плане от смены настроек: «было → станет» для карточки
 * ProposedSettingsCard. Та же computeBudget, что и на экранах, — как и у
 * чата на сервере (buildSettingsProposal).
 */
export function previewSettingsChange(input: BudgetInput, change: Partial<HouseholdSettings>): ProposedSettings {
  const before = computeBudget(input)
  const after = computeBudget({ ...input, settings: { ...input.settings, ...planOverrides(change) } })
  return {
    household: change,
    preview: {
      debt_free_before: before.plan.debtFreeDate,
      debt_free_after: after.plan.debtFreeDate,
      interest_before: before.plan.totalInterest,
      interest_after: after.plan.totalInterest,
      cushion_full_before: before.plan.cushionFullDate,
      cushion_full_after: after.plan.cushionFullDate,
      per_day_before: before.perDay,
      per_day_after: after.perDay,
    },
  }
}
