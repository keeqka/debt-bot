import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { FormSheet } from '@/components/chrome/FormSheet'
import { Paper, PaperRow } from '@/components/chrome/Paper'
import { MascotAvatar } from '@/components/Mascot'
import { useBudgetInput } from '@/hooks/use-finance-data'
import { useCurrentUser } from '@/lib/auth'
import { features } from '@/lib/env'
import { GLOSSARY, explainParts, type TermId } from '@/lib/glossary'
import { cn } from '@/lib/utils'

const TermContext = createContext<(id: TermId) => void>(() => {})

/** Открыть лист термина откуда угодно (например, из чата на «Что такое ГЭСВ?»). */
export function useOpenTerm() {
  return useContext(TermContext)
}

/** Хост листа: один на приложение, лежит в AppShell. */
export function TermProvider({ children }: { children: ReactNode }) {
  const [id, setId] = useState<TermId | null>(null)
  const open = useCallback((next: TermId) => features.glossary && setId(next), [])
  return (
    <TermContext.Provider value={open}>
      {children}
      <TermSheet id={id} onClose={() => setId(null)} />
    </TermContext.Provider>
  )
}

/** Слово с пунктирным подчёркиванием: тап открывает объяснение на твоих цифрах. */
export function Term({ id, children, className }: { id: TermId; children?: ReactNode; className?: string }) {
  const open = useOpenTerm()
  if (!features.glossary) return <>{children ?? GLOSSARY[id].title}</>
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        open(id)
      }}
      className={cn(
        'inline cursor-help underline decoration-dashed decoration-1 underline-offset-[3px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hf-accent',
        className,
      )}
    >
      {children ?? GLOSSARY[id].title}
    </button>
  )
}

function TermSheet({ id, onClose }: { id: TermId | null; onClose: () => void }) {
  const input = useBudgetInput()
  const user = useCurrentUser()
  // Держим последний термин, пока лист закрывается — иначе содержимое исчезает раньше анимации.
  const [last, setLast] = useState<TermId>('compound')
  if (id && id !== last) setLast(id)
  const term = GLOSSARY[id ?? last]
  const parts = explainParts(user.explain_level)
  const example = useMemo(() => (parts.example ? term.example({ input: input ?? null }) : null), [parts.example, term, input])

  return (
    <FormSheet
      open={id != null}
      onOpenChange={(o) => !o && onClose()}
      title={term.title}
      footer={
        <button type="button" onClick={onClose} className="min-h-11 w-full rounded-[13px] bg-hf-card py-3 text-[15px] text-hf-text-2">
          Понятно
        </button>
      }
    >
      <div className="flex items-start gap-2.5">
        <MascotAvatar size={28} expression="calm" className="mt-0.5 shrink-0" />
        <p className="text-[14px] leading-relaxed text-hf-text-2">{term.plain}</p>
      </div>

      {example && (
        <Paper className="space-y-2 rounded-[16px] p-3.5">
          <p className="text-[12px] leading-snug text-hf-ink-soft">
            {example.sample && <span className="mr-1 font-mono text-[10px] tracking-[0.1em] uppercase">пример · </span>}
            {example.title}
          </p>
          {example.rows.map((r, i) => (
            <PaperRow key={i} label={r.label} value={r.value} tone={r.tone} />
          ))}
          {example.bars && example.bars.length > 0 && (
            <div className="space-y-1.5 pt-1">
              {example.bars.map((b, i) => (
                <div key={i} className="space-y-0.5">
                  <div className="flex justify-between text-[11px] text-hf-ink-soft">
                    <span>{b.label}</span>
                    <span className="font-mono">{b.value}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-hf-ink/10">
                    <div className={cn('h-full rounded-full', b.tone === 'warn' ? 'bg-hf-warn-ink' : 'bg-hf-accent-ink')} style={{ width: `${b.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
          {example.note && <p className="text-[11px] leading-snug text-hf-ink-soft">{example.note}</p>}
        </Paper>
      )}

      {parts.detail && <p className="text-[12px] leading-relaxed text-hf-text-3">{term.detail}</p>}
    </FormSheet>
  )
}
