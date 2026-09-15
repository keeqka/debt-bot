import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Send, Copy, Check, CreditCard, Trash2 } from 'lucide-react'
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
import { Paper } from '@/components/chrome/Paper'
import { ProgressBar } from '@/components/chrome/ProgressBar'
import { MascotAvatar } from '@/components/Mascot'
import { useChatMessages, useClearChat, useSendChatMessage } from '@/hooks/use-finance-data'
import { formatMoney } from '@/lib/format'
import { AddDebtDialog } from '@/components/debts/AddDebtDialog'
import { MarkdownMessage } from '@/components/chat/MarkdownMessage'
import { useHeaderAction } from '@/lib/header-action'
import type { ChatDataWidgetRow, ProposedDebt } from '@/types/domain'

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

  useHeaderAction(
    <button
      onClick={() => setConfirmClear(true)}
      disabled={!messages?.length}
      aria-label="Очистить чат"
      className="text-hf-text-4 hover:text-hf-warn-on-dark disabled:pointer-events-none disabled:opacity-40"
    >
      <Trash2 className="h-[18px] w-[18px]" />
    </button>,
    [messages?.length],
  )

  const lastMessage = messages?.[messages.length - 1]
  const quickReplies = !sendMessage.isPending && lastMessage?.role === 'assistant' ? lastMessage.quick_replies : null

  return (
    // AppShell's shell is min-h-dvh (grows with content, page itself scrolls) —
    // every other screen wants that, but Chat needs a bounded height so the
    // message list scrolls in place and the input stays put at the bottom.
    // --tg-height (Phase 1, lib/telegram.ts) is Telegram's actual stable
    // viewport, more accurate than 100dvh alone inside the WebView.
    <div className="flex flex-col" style={{ height: 'calc(var(--tg-height, 100dvh) - 8.5rem)' }}>
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pb-2">
        {isLoading ? (
          <div className="h-16 w-3/4 animate-pulse rounded-2xl bg-hf-card" />
        ) : (
          messages?.map((m) =>
            m.role === 'user' ? (
              <div key={m.id} className="flex justify-end pb-2">
                <p className="max-w-[82%] rounded-[16px_16px_4px_16px] bg-hf-accent px-3.5 py-2.5 text-sm leading-snug break-words whitespace-pre-wrap text-white">
                  {m.content}
                </p>
              </div>
            ) : (
              <div key={m.id} className="flex flex-col gap-1 pb-2">
                <div className="flex items-end gap-2">
                  <MascotAvatar size={26} expression="focused" className="shrink-0" />
                  {m.data_widget && m.data_widget.length > 0 ? (
                    <div className="min-w-0 max-w-[82%] space-y-2">
                      {m.content && <p className="text-sm leading-snug text-hf-text-2">{m.content}</p>}
                      <DataWidget rows={m.data_widget} />
                    </div>
                  ) : (
                    <div className="min-w-0 max-w-[82%] rounded-[16px_16px_16px_4px] bg-hf-card px-3.5 py-2.5 text-sm leading-relaxed break-words text-hf-text-2">
                      <MarkdownMessage content={m.content} />
                    </div>
                  )}
                </div>

                {m.proposed_debt && <ProposedDebtCard debt={m.proposed_debt} onAdd={() => setDebtPrefill(m.proposed_debt!)} />}

                <button
                  onClick={() => handleCopy(m.id, m.content)}
                  aria-label="Скопировать сообщение"
                  className="flex items-center gap-1 self-start pl-9 text-hf-text-4"
                >
                  {copiedId === m.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                </button>
              </div>
            ),
          )
        )}
        {sendMessage.isPending && (
          <div className="flex items-center gap-2 pb-2">
            <MascotAvatar size={26} expression="thinking" />
            <div className="flex items-center gap-1 rounded-[16px_16px_16px_4px] bg-hf-card px-3.5 py-3">
              {[0, 1, 2].map((i) => (
                <span key={i} className="h-1.5 w-1.5 animate-pulse rounded-full bg-hf-text-4" style={{ animationDelay: `${i * 150}ms` }} />
              ))}
            </div>
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      {(messages?.length ?? 0) <= 1 && (
        <div className="flex flex-wrap gap-1.5 pb-2">
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => handleSend(s)} className="rounded-full border border-hf-line bg-hf-bar px-3 py-1.5 text-xs text-hf-text-3">
              {s}
            </button>
          ))}
        </div>
      )}

      {quickReplies && quickReplies.length > 0 && (
        <div className="flex flex-wrap gap-2 pb-2 pl-9">
          {quickReplies.map((q) => (
            <button key={q} onClick={() => handleSend(q)} className="rounded-[9px] border border-hf-line px-3 py-1.5 text-[13px] text-hf-accent-on-dark">
              {q}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          handleSend(draft)
        }}
        className="flex items-center gap-2.5 pt-1"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Спросите про свои финансы..."
          className="h-11 flex-1 rounded-[13px] border border-hf-line bg-hf-card px-4 text-sm text-hf-text outline-none placeholder:text-hf-text-4"
        />
        <button
          type="submit"
          disabled={!draft.trim() || sendMessage.isPending}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-hf-accent text-white disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>

      <AddDebtDialog open={Boolean(debtPrefill)} onOpenChange={(open) => !open && setDebtPrefill(null)} prefill={debtPrefill ?? undefined} />

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Очистить историю чата?</AlertDialogTitle>
            <AlertDialogDescription>Вся переписка с AI-советником удалится безвозвратно — для обоих участников, чат общий.</AlertDialogDescription>
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

function DataWidget({ rows }: { rows: ChatDataWidgetRow[] }) {
  return (
    <Paper className="flex flex-col gap-2.5 rounded-[16px] p-3.5">
      {rows.map((r) => (
        <div key={r.name} className="flex flex-col gap-1.5">
          <div className="flex justify-between gap-2.5 text-[13px]">
            <span>{r.name}</span>
            <span className="font-mono">{formatMoney(r.amount)}</span>
          </div>
          <ProgressBar pct={r.pct} onPaper height={6} />
        </div>
      ))}
    </Paper>
  )
}

function ProposedDebtCard({ debt, onAdd }: { debt: ProposedDebt; onAdd: () => void }) {
  return (
    <div className="ml-9 w-fit max-w-[82%] space-y-2 rounded-[16px_16px_16px_4px] bg-hf-card p-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-hf-text">
        <CreditCard className="h-3.5 w-3.5" />
        Предложение: новый долг
      </div>
      <div className="space-y-0.5 text-xs text-hf-text-3">
        <p>
          {debt.title} · {debt.creditor}
        </p>
        {debt.principal_amount != null && <p>Сумма: {formatMoney(debt.principal_amount)}</p>}
        {debt.interest_rate != null && <p>Ставка: {debt.interest_rate}%</p>}
      </div>
      <button type="button" onClick={onAdd} className="w-full rounded-[10px] bg-hf-accent py-2 text-xs font-medium text-white">
        Добавить долг
      </button>
    </div>
  )
}
