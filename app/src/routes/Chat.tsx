import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Send, Loader2, Copy, Check, CreditCard, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useChatMessages, useClearChat, useSendChatMessage } from '@/hooks/use-finance-data'
import { cn } from '@/lib/utils'
import { modelLabel } from '@/lib/ai-models'
import { formatMoney } from '@/lib/format'
import { AddDebtDialog } from '@/components/debts/AddDebtDialog'
import { MarkdownMessage } from '@/components/chat/MarkdownMessage'
import type { ProposedDebt } from '@/types/domain'

const SUGGESTIONS = ['Могу я купить MacBook за 750 000₸?', 'Как быстрее закрыть долги?', 'Сколько я трачу на еду в месяц?']

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const el = document.createElement('textarea')
    el.value = text
    el.style.position = 'fixed'
    el.style.opacity = '0'
    document.body.appendChild(el)
    el.select()
    document.execCommand('copy')
    document.body.removeChild(el)
  }
}

export function Chat() {
  const { data: messages, isLoading } = useChatMessages()
  const sendMessage = useSendChatMessage()
  const clearChat = useClearChat()
  const [draft, setDraft] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [debtPrefill, setDebtPrefill] = useState<ProposedDebt | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sendMessage.isPending])

  function handleSend(text: string) {
    const trimmed = text.trim()
    if (!trimmed || sendMessage.isPending) return
    setDraft('')
    sendMessage.mutate(trimmed)
  }

  async function handleCopy(id: string, content: string) {
    await copyText(content)
    setCopiedId(id)
    toast.success('Скопировано')
    setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 1500)
  }

  async function confirmClearChat() {
    await clearChat.mutateAsync()
    toast.success('История чата очищена')
    setConfirmClear(false)
  }

  return (
    <div className="flex h-[calc(100dvh-8.5rem)] flex-col">
      <div className="flex items-center justify-end pb-2">
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-destructive h-auto gap-1.5 px-2 py-1 text-xs"
          onClick={() => setConfirmClear(true)}
          disabled={!messages?.length}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Очистить чат
        </Button>
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto pb-2">
        {isLoading ? (
          <Skeleton className="h-16 w-3/4 rounded-2xl" />
        ) : (
          messages?.map((m) => {
            const label = m.role === 'assistant' ? modelLabel(m.model) : null
            return (
              <div key={m.id} className={cn('flex flex-col gap-1 pb-2', m.role === 'user' ? 'items-end' : 'items-start')}>
                <div
                  className={cn(
                    'max-w-[85%] min-w-0 rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed break-words',
                    m.role === 'user' ? 'bg-primary text-primary-foreground rounded-br-sm whitespace-pre-wrap' : 'bg-muted rounded-bl-sm',
                  )}
                >
                  {m.role === 'assistant' ? <MarkdownMessage content={m.content} /> : m.content}
                </div>

                {m.proposed_debt && (
                  <ProposedDebtCard debt={m.proposed_debt} onAdd={() => setDebtPrefill(m.proposed_debt!)} />
                )}

                <div className={cn('flex items-center gap-2 px-1 text-[10px]', m.role === 'user' && 'flex-row-reverse')}>
                  {label && <span className="text-muted-foreground">{label}</span>}
                  <button
                    onClick={() => handleCopy(m.id, m.content)}
                    aria-label="Скопировать сообщение"
                    className="text-muted-foreground hover:text-foreground flex items-center gap-1"
                  >
                    {copiedId === m.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  </button>
                </div>
              </div>
            )
          })
        )}
        {sendMessage.isPending && (
          <div className="bg-muted flex w-fit items-center gap-2 rounded-2xl rounded-bl-sm px-3.5 py-2.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span className="text-muted-foreground text-xs">думает...</span>
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      {(messages?.length ?? 0) <= 1 && (
        <div className="flex flex-wrap gap-1.5 pb-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => handleSend(s)}
              className="border-border bg-background hover:bg-muted rounded-full border px-3 py-1.5 text-xs transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          handleSend(draft)
        }}
        className="flex items-center gap-2 pt-1"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Спросите про свои финансы..."
          className="border-input h-11 flex-1 rounded-full border bg-transparent px-4 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <Button type="submit" size="icon" className="h-11 w-11 shrink-0 rounded-full" disabled={!draft.trim() || sendMessage.isPending}>
          <Send className="h-4 w-4" />
        </Button>
      </form>

      <AddDebtDialog open={Boolean(debtPrefill)} onOpenChange={(open) => !open && setDebtPrefill(null)} prefill={debtPrefill ?? undefined} />

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Очистить историю чата?</AlertDialogTitle>
            <AlertDialogDescription>
              Вся переписка с AI-советником удалится безвозвратно — для обоих участников, чат общий.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={confirmClearChat} disabled={clearChat.isPending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {clearChat.isPending ? 'Удаление...' : 'Очистить'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function ProposedDebtCard({ debt, onAdd }: { debt: ProposedDebt; onAdd: () => void }) {
  return (
    <div className="bg-muted/50 w-full max-w-[85%] space-y-2 rounded-2xl rounded-bl-sm border border-border p-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold">
        <CreditCard className="h-3.5 w-3.5" />
        Предложение: новый долг
      </div>
      <div className="text-muted-foreground space-y-0.5 text-xs">
        <p>
          {debt.title} · {debt.creditor}
        </p>
        {debt.principal_amount != null && <p>Сумма: {formatMoney(debt.principal_amount)}</p>}
        {debt.interest_rate != null && <p>Ставка: {debt.interest_rate}%</p>}
      </div>
      <Button size="sm" variant="secondary" className="w-full" onClick={onAdd}>
        Добавить долг
      </Button>
    </div>
  )
}
