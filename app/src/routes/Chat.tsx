import { useEffect, useRef, useState } from 'react'
import { Send, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useChatMessages, useSendChatMessage } from '@/hooks/use-finance-data'
import { cn } from '@/lib/utils'

const SUGGESTIONS = ['Могу я купить MacBook за 750 000₸?', 'Как быстрее закрыть долги?', 'Сколько я трачу на еду в месяц?']

export function Chat() {
  const { data: messages, isLoading } = useChatMessages()
  const sendMessage = useSendChatMessage()
  const [draft, setDraft] = useState('')
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

  return (
    <div className="flex h-[calc(100dvh-8.5rem)] flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto pb-2">
        {isLoading ? (
          <Skeleton className="h-16 w-3/4 rounded-2xl" />
        ) : (
          messages?.map((m) => (
            <div
              key={m.id}
              className={cn(
                'max-w-[85%] min-w-0 rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed break-words whitespace-pre-wrap',
                m.role === 'user' ? 'bg-primary text-primary-foreground ml-auto rounded-br-sm' : 'bg-muted rounded-bl-sm',
              )}
            >
              {m.content}
            </div>
          ))
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
    </div>
  )
}
