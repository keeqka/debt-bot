import { useQueryClient, useQuery } from '@tanstack/react-query'
import type { ReceiptParseResult, StatementTransaction } from '@/types/domain'

/**
 * State for the Чеки tab's upload/confirm pipeline — idle -> uploading ->
 * reading -> parsed -> saved | error. receipts-parse/statement-parse are
 * already fast, synchronous Claude calls (no polling, no job table), so
 * there's no real backend async to model. What FUNCTIONAL.md actually asks
 * for ("не блокирует интерфейс, можно уйти на другой таб и вернуться") is
 * just that the in-progress state survives a tab switch — stored in the
 * TanStack Query cache instead of component useState so it does, since the
 * QueryClient outlives route unmounts under HashRouter while a component's
 * own state wouldn't.
 */
export type ReceiptDraft =
  | { status: 'idle' }
  | { status: 'uploading'; kind: 'receipt' | 'statement' }
  | { status: 'reading'; kind: 'receipt' | 'statement' }
  | { status: 'parsed-receipt'; result: ReceiptParseResult; categoryId: string }
  | { status: 'parsed-statement'; rows: StatementDraftRow[] }
  | { status: 'error'; message: string }

export interface StatementDraftRow extends StatementTransaction {
  key: string
  included: boolean
  categoryId: string
}

const DRAFT_KEY = ['receipt-draft'] as const

export function useReceiptDraft() {
  const queryClient = useQueryClient()
  const { data } = useQuery<ReceiptDraft>({
    queryKey: DRAFT_KEY,
    queryFn: () => queryClient.getQueryData<ReceiptDraft>(DRAFT_KEY) ?? { status: 'idle' },
    initialData: { status: 'idle' },
    staleTime: Infinity,
    gcTime: Infinity,
  })

  const setDraft = (draft: ReceiptDraft) => queryClient.setQueryData<ReceiptDraft>(DRAFT_KEY, draft)
  const reset = () => setDraft({ status: 'idle' })

  return { draft: data, setDraft, reset }
}
