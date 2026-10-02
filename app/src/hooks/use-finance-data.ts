import { useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import * as api from '@/lib/api'
import { computeMonth } from '@/lib/month'
import { currencySymbol } from '@/lib/format'
import { toPlanSettings } from '@/lib/month'
import { useCurrentUser } from '@/lib/auth'
import type { BudgetInput } from '@/lib/budget'
import type { ChatMessage, HouseholdSettings, NeedKind, User } from '@/types/domain'

export const queryKeys = {
  status: ['status'] as const,
  debts: ['debts'] as const,
  debtPayments: (debtId: string) => ['debt-payments', debtId] as const,
  allDebtPayments: ['debt-payments', 'all'] as const,
  householdSettings: ['household-settings'] as const,
  accessInfo: ['access-info'] as const,
  incomes: ['incomes'] as const,
  expenses: ['expenses'] as const,
  categories: ['categories'] as const,
  merchantRules: ['merchant-rules'] as const,
  goals: ['goals'] as const,
  bankProducts: ['bank-products'] as const,
  chatMessages: ['chat-messages'] as const,
  users: ['users'] as const,
  subscription: ['subscription'] as const,
  receiptScanCount: ['receipt-scan-count'] as const,
  annualExpenses: ['annual-expenses'] as const,
}

// Pure DB read (see api.getStatus) — cheap no matter how often it's called,
// unlike the AI computation itself, which only ever runs from the weekly
// cron or useRefreshStatus below.
export const useStatus = () => useQuery({ queryKey: queryKeys.status, queryFn: api.getStatus })

export function useRefreshStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: api.refreshStatus,
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.status, data)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Не удалось обновить статус')
    },
  })
}
export const useUsers = () => useQuery({ queryKey: queryKeys.users, queryFn: api.getUsers })
export const useDebts = () => useQuery({ queryKey: queryKeys.debts, queryFn: api.getDebts })
export const useIncomes = () => useQuery({ queryKey: queryKeys.incomes, queryFn: api.getIncomes })
export const useExpenses = () => useQuery({ queryKey: queryKeys.expenses, queryFn: api.getExpenses })
export const useCategories = () => useQuery({ queryKey: queryKeys.categories, queryFn: api.getCategories })
export const useAnnualExpenses = () => useQuery({ queryKey: queryKeys.annualExpenses, queryFn: api.getAnnualExpenses })
export const useGoals = () => useQuery({ queryKey: queryKeys.goals, queryFn: api.getGoals })
export const useBankProducts = () => useQuery({ queryKey: queryKeys.bankProducts, queryFn: api.getBankProducts })
export const useChatMessages = () => useQuery({ queryKey: queryKeys.chatMessages, queryFn: api.getChatMessages })

export const useAllDebtPayments = () => useQuery({ queryKey: queryKeys.allDebtPayments, queryFn: api.getAllDebtPayments })

/**
 * The household budget (lib/budget.ts via lib/month.ts) — the single source
 * for every number derived from income/expenses/debts: Overview, the debt
 * plan's monthly extra, goals, insights. A pure aggregation over lists these
 * hooks already fetch and cache.
 */
export function useBudgetInput(): BudgetInput | undefined {
  const currentUser = useCurrentUser()
  const { data: users } = useUsers()
  const { data: debts } = useDebts()
  const { data: debtPayments } = useAllDebtPayments()
  const { data: expenses } = useExpenses()
  const { data: incomes } = useIncomes()
  const { data: categories } = useCategories()
  const { data: goals } = useGoals()
  const { data: settings } = useHouseholdSettings()
  const { data: annualExpenses } = useAnnualExpenses()

  return useMemo(() => {
    if (!annualExpenses || !users || !debts || !debtPayments || !expenses || !incomes || !categories || !goals || !settings) return undefined
    // The current user's row comes from the auth cache, which is what
    // useUpdateUser writes to first — prefer it over the (possibly older) list.
    const household = users.map((u) => (u.id === currentUser.id ? currentUser : u))
    if (!household.some((u) => u.id === currentUser.id)) household.push(currentUser)
    return {
      userIncomes: household.map((u) => u.monthly_income),
      incomes,
      expenses,
      debts,
      debtPayments,
      hasActiveGoals: goals.some((g) => g.status === 'active' && !g.is_cushion),
      cushionBalance: goals.filter((g) => g.is_cushion && g.status === 'active').reduce((s, g) => s + g.current_amount, 0),
      settings: toPlanSettings(settings),
      categoryNames: Object.fromEntries(categories.map((c) => [c.id, c.name])),
      categoryNeedKinds: Object.fromEntries(categories.map((c) => [c.id, c.need_kind ?? null])),
      annualExpenses,
      currencySymbol: currencySymbol(),
    }
  }, [currentUser, users, debts, debtPayments, expenses, incomes, categories, goals, settings, annualExpenses])
}

export function useMonth() {
  const input = useBudgetInput()
  return useMemo(() => (input ? computeMonth(input) : undefined), [input])
}

/** When the last debt closes under the household's plan (lib/budget.ts simulatePlan) — undefined while loading. */
export function useDebtFreeDate(): string | null | undefined {
  const month = useMonth()
  return month ? month.plan.debtFreeDate : undefined
}

export const useAccessInfo = () => useQuery({ queryKey: queryKeys.accessInfo, queryFn: api.getAccessInfo })

export function useCreateInvite() {
  return useMutation({
    mutationFn: api.createInvite,
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Не получилось создать приглашение'),
  })
}

export const useHouseholdSettings = () => useQuery({ queryKey: queryKeys.householdSettings, queryFn: api.getHouseholdSettings })

function useAnnualMutation<TVars>(fn: (v: TVars) => Promise<unknown>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.annualExpenses }),
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Не удалось сохранить'),
  })
}

export const useAddAnnualExpense = () => useAnnualMutation(api.addAnnualExpense)
export const useUpdateAnnualExpense = () =>
  useAnnualMutation(({ id, patch }: { id: string; patch: Parameters<typeof api.updateAnnualExpense>[1] }) => api.updateAnnualExpense(id, patch))
export const useDeleteAnnualExpense = () => useAnnualMutation(api.deleteAnnualExpense)

export function useSetCategoryNeedKind() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, needKind }: { id: string; needKind: NeedKind }) => api.updateCategoryNeedKind(id, needKind),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.categories }),
  })
}

export function useCreateReminder() {
  return useMutation({
    mutationFn: api.createReminder,
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Не удалось поставить напоминание'),
  })
}

/** Настройки сохраняются оптимистично: экран меняется сразу, при ошибке откатывается к прежним. */
export function useUpdateHouseholdSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: api.updateHouseholdSettings,
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.householdSettings })
      const previous = queryClient.getQueryData<HouseholdSettings>(queryKeys.householdSettings)
      if (previous) queryClient.setQueryData<HouseholdSettings>(queryKeys.householdSettings, { ...previous, ...patch })
      return { previous }
    },
    onSuccess: (settings) => queryClient.setQueryData(queryKeys.householdSettings, settings),
    onError: (error, _patch, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.householdSettings, context.previous)
      toast.error(error instanceof Error ? error.message : 'Не удалось сохранить настройки')
    },
  })
}

export function useUpdateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string
      patch: Partial<Pick<User, 'monthly_income' | 'payday' | 'daily_reminder_enabled' | 'daily_reminder_time' | 'vacation_paused' | 'onboarding_completed_at' | 'bot_tone'>>
    }) => api.updateUser(id, patch),
    // Оптимистично: собственная строка в кэше меняется сразу, откат — при ошибке.
    onMutate: async ({ id, patch }) => {
      const current = queryClient.getQueryData<User>(['current-user'])
      if (current && current.id === id) queryClient.setQueryData(['current-user'], { ...current, ...patch })
      return { current }
    },
    onError: (error, _vars, context) => {
      if (context?.current) queryClient.setQueryData(['current-user'], context.current)
      toast.error(error instanceof Error ? error.message : 'Не удалось сохранить')
    },
    onSuccess: (user) => {
      // A settings card from chat can change the partner's row (their income) —
      // only overwrite the session's own user with its own row.
      const current = queryClient.getQueryData<User>(['current-user'])
      if (!current || current.id === user.id) queryClient.setQueryData(['current-user'], user)
      queryClient.invalidateQueries({ queryKey: queryKeys.users })
    },
  })
}

export const useDebtPayments = (debtId: string) =>
  useQuery({ queryKey: queryKeys.debtPayments(debtId), queryFn: () => api.getDebtPayments(debtId) })

export function useAddDebtPayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: api.addDebtPayment,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.debts })
      queryClient.invalidateQueries({ queryKey: queryKeys.debtPayments(variables.debt_id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.allDebtPayments })
      queryClient.invalidateQueries({ queryKey: queryKeys.status })
    },
  })
}

export function useAddDebt() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: api.addDebt,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.debts })
    },
  })
}

export function useUpdateDebt() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof api.updateDebt>[1] }) => api.updateDebt(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.debts })
    },
  })
}

export function useDeleteDebt() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: api.deleteDebt,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.debts })
      queryClient.invalidateQueries({ queryKey: queryKeys.allDebtPayments })
      queryClient.invalidateQueries({ queryKey: queryKeys.status })
    },
  })
}

export function useAddGoal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: api.addGoal,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.goals }),
  })
}

export function useUpdateGoal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof api.updateGoal>[1] }) => api.updateGoal(id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.goals }),
  })
}

export function useAddCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: api.addCategory,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.categories }),
  })
}

export function useDeleteCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: api.deleteCategory,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.categories }),
  })
}

export function useAddExpense() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: api.addExpense,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses })
      queryClient.invalidateQueries({ queryKey: queryKeys.status })
    },
  })
}

export function useAddIncome() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: api.addIncome,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.incomes })
      queryClient.invalidateQueries({ queryKey: queryKeys.status })
    },
  })
}

export function useAddExpensesBulk() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: api.addExpensesBulk,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses })
      queryClient.invalidateQueries({ queryKey: queryKeys.status })
    },
  })
}

export function useAddIncomesBulk() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: api.addIncomesBulk,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.incomes })
      queryClient.invalidateQueries({ queryKey: queryKeys.status })
    },
  })
}

export function useDeleteExpense() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: api.deleteExpense,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses })
      queryClient.invalidateQueries({ queryKey: queryKeys.status })
    },
  })
}

export const useMerchantRules = () => useQuery({ queryKey: queryKeys.merchantRules, queryFn: api.getMerchantRules })

export function useSaveMerchantRules() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: api.saveMerchantRules,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.merchantRules }),
  })
}

export function useDeleteMerchantRule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: api.deleteMerchantRule,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.merchantRules }),
  })
}

export function useUpdateExpensesCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ ids, categoryId }: { ids: string[]; categoryId: string }) => api.updateExpensesCategory(ids, categoryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses })
      queryClient.invalidateQueries({ queryKey: queryKeys.status })
    },
  })
}

export function useDeleteAllExpenses() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: api.deleteAllExpenses,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses })
      queryClient.invalidateQueries({ queryKey: queryKeys.status })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Не удалось удалить траты')
    },
  })
}

export function useUpdateExpense() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof api.updateExpense>[1] }) => api.updateExpense(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses })
      queryClient.invalidateQueries({ queryKey: queryKeys.status })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Не удалось сохранить трату')
    },
  })
}

export function useDeleteIncome() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: api.deleteIncome,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.incomes })
      queryClient.invalidateQueries({ queryKey: queryKeys.status })
    },
  })
}

export const sendChatMutationKey = ['send-chat'] as const

export function useSendChatMessage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: sendChatMutationKey,
    mutationFn: api.sendChatMessage,
    // Optimistically show the user's own bubble immediately instead of waiting
    // for the AI reply to round-trip before anything appears.
    onMutate: async (input: Parameters<typeof api.sendChatMessage>[0]) => {
      const content = typeof input === 'string' ? input : input.content
      const optimisticId = `optimistic-${Date.now()}`
      queryClient.setQueryData<ChatMessage[]>(queryKeys.chatMessages, (old = []) => [
        ...old,
        { id: optimisticId, user_id: 'me', role: 'user', content, created_at: new Date().toISOString() },
      ])
      return { optimisticId }
    },
    onError: (error, _content, context) => {
      // Only drop the one bubble that failed — never blindly restore an old
      // snapshot, which could also wipe real messages that arrived meanwhile.
      if (context?.optimisticId) {
        queryClient.setQueryData<ChatMessage[]>(queryKeys.chatMessages, (old = []) =>
          old.filter((m) => m.id !== context.optimisticId),
        )
      }
      toast.error(error instanceof Error ? error.message : 'Не удалось отправить сообщение')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.chatMessages })
    },
  })
}

export function useClearChat() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: api.clearChatMessages,
    onSuccess: () => {
      queryClient.setQueryData<ChatMessage[]>(queryKeys.chatMessages, [])
    },
  })
}

export const useSubscription = () => useQuery({ queryKey: queryKeys.subscription, queryFn: api.getSubscription })

export function useActivateSubscription() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: api.activateSubscription,
    onSuccess: (subscription) => {
      queryClient.setQueryData(queryKeys.subscription, subscription)
    },
  })
}

export const useReceiptScanCount = () => useQuery({ queryKey: queryKeys.receiptScanCount, queryFn: api.getReceiptScanCountThisMonth })

/** Logs one parse attempt (receipt or statement, success or failure) — must be awaited before the scan count is trusted again. */
export function useLogReceiptScan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: api.logReceiptScan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.receiptScanCount })
    },
  })
}
