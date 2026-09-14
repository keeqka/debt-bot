import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import * as api from '@/lib/api'
import type { ChatMessage, DebtStrategyKind } from '@/types/domain'

export const queryKeys = {
  status: ['status'] as const,
  debts: ['debts'] as const,
  debtPayments: (debtId: string) => ['debt-payments', debtId] as const,
  debtStrategy: (kind: DebtStrategyKind, surplus: number) => ['debt-strategy', kind, surplus] as const,
  incomes: ['incomes'] as const,
  expenses: ['expenses'] as const,
  categories: ['categories'] as const,
  goals: ['goals'] as const,
  bankProducts: ['bank-products'] as const,
  chatMessages: ['chat-messages'] as const,
  users: ['users'] as const,
}

export const useStatus = () => useQuery({ queryKey: queryKeys.status, queryFn: api.getStatus, staleTime: 1000 * 60 * 60 })
export const useUsers = () => useQuery({ queryKey: queryKeys.users, queryFn: api.getUsers })
export const useDebts = () => useQuery({ queryKey: queryKeys.debts, queryFn: api.getDebts })
export const useIncomes = () => useQuery({ queryKey: queryKeys.incomes, queryFn: api.getIncomes })
export const useExpenses = () => useQuery({ queryKey: queryKeys.expenses, queryFn: api.getExpenses })
export const useCategories = () => useQuery({ queryKey: queryKeys.categories, queryFn: api.getCategories })
export const useGoals = () => useQuery({ queryKey: queryKeys.goals, queryFn: api.getGoals })
export const useBankProducts = () => useQuery({ queryKey: queryKeys.bankProducts, queryFn: api.getBankProducts })
export const useChatMessages = () => useQuery({ queryKey: queryKeys.chatMessages, queryFn: api.getChatMessages })

export const useDebtPayments = (debtId: string) =>
  useQuery({ queryKey: queryKeys.debtPayments(debtId), queryFn: () => api.getDebtPayments(debtId) })

export const useDebtStrategy = (kind: DebtStrategyKind, monthlySurplus: number) =>
  useQuery({
    queryKey: queryKeys.debtStrategy(kind, monthlySurplus),
    queryFn: () => api.getDebtStrategy(kind, monthlySurplus),
  })

export function useAddDebtPayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: api.addDebtPayment,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.debts })
      queryClient.invalidateQueries({ queryKey: queryKeys.debtPayments(variables.debt_id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.status })
    },
  })
}

export function useAddDebt() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: api.addDebt,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.debts }),
  })
}

export function useUpdateDebt() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof api.updateDebt>[1] }) => api.updateDebt(id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.debts }),
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

export function useSendChatMessage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: api.sendChatMessage,
    // Optimistically show the user's own bubble immediately instead of waiting
    // for the AI reply to round-trip before anything appears.
    onMutate: async (content: string) => {
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
