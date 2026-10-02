import { toast } from 'sonner'
import { Check, X } from 'lucide-react'
import { FormSheet } from '@/components/chrome/FormSheet'
import { Paper } from '@/components/chrome/Paper'
import { MascotAvatar } from '@/components/Mascot'
import { useCategories, useChallenges, useExpenses, useSetChallengeStatus, useStartChallenge, useWeeklyReview } from '@/hooks/use-finance-data'
import { CHALLENGES, autoSpent } from '@/lib/challenges'
import { formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Challenge } from '@/types/domain'

const dayWord = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'день' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'дня' : 'дней')

/**
 * Разбор недели (10): одна победа, одна поправка, веха (если пришла) и два
 * челленджа. Открывается кнопкой из сообщения бота (#/overview?review=1) или
 * строкой на Обзоре. Принятый челлендж живёт ниже: считается по тратам сам или
 * отмечается вручную.
 */
export function WeeklyReviewSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: review, isLoading } = useWeeklyReview()
  const { data: challenges } = useChallenges()
  const { data: expenses } = useExpenses()
  const { data: categories } = useCategories()
  const start = useStartChallenge()
  const setStatus = useSetChallengeStatus()

  const active = (challenges ?? []).filter((c) => c.status === 'active')
  const activeKinds = new Set(active.map((c) => c.kind))
  const categoryName = new Map((categories ?? []).map((c) => [c.id, c.name]))

  function progress(c: Challenge): string {
    const left = Math.max(0, Math.ceil((new Date(c.ends_at).getTime() - Date.now()) / 86_400_000))
    const spent = autoSpent(
      c.kind,
      (expenses ?? []).map((e) => ({ amount: e.amount, spent_at: e.spent_at, categoryName: e.category_id ? (categoryName.get(e.category_id) ?? null) : null })),
      c.started_at,
    )
    const tail = left > 0 ? `осталось ${left} ${dayWord(left)}` : 'срок вышел'
    if (spent == null) return tail
    return spent === 0 ? `трат нет · ${tail}` : `потрачено ${formatMoney(spent)} · ${tail}`
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Разбор недели"
      footer={
        <button type="button" onClick={() => onOpenChange(false)} className="min-h-11 w-full rounded-[13px] bg-hf-card py-3 text-[15px] text-hf-text-2">
          Готово
        </button>
      }
    >
      {isLoading ? (
        <div className="h-48 animate-pulse rounded-[18px] bg-hf-card" />
      ) : !review ? (
        <div className="flex items-start gap-2.5">
          <MascotAvatar size={28} expression="calm" className="mt-0.5 shrink-0" />
          <p className="text-[14px] leading-relaxed text-hf-text-2">Первый разбор придёт в твой день недели — выбрать его можно в настройках. Пока копятся траты, считать нечего.</p>
        </div>
      ) : (
        <>
          {review.milestone && (
            <div className="flex items-center gap-2.5 rounded-[14px] bg-hf-card p-3">
              <MascotAvatar size={34} expression="happy" bounce className="shrink-0" />
              <p className="text-[13px] leading-snug text-hf-text">{review.milestone.text}</p>
            </div>
          )}

          <Paper className="space-y-3 rounded-[16px] p-3.5">
            <div>
              <p className="font-mono text-[10px] tracking-[0.1em] text-hf-accent-ink uppercase">Победа</p>
              <p className="mt-1 text-[13px] leading-snug text-hf-ink">{review.win}</p>
            </div>
            <div className="border-t border-hf-ink/10 pt-3">
              <p className="font-mono text-[10px] tracking-[0.1em] text-hf-warn-ink uppercase">Поправка</p>
              <p className="mt-1 text-[13px] leading-snug text-hf-ink">{review.fix}</p>
            </div>
          </Paper>

          <p className="pt-1 font-mono text-[11px] tracking-[0.1em] text-hf-text-4 uppercase">Челленджи на неделю</p>
          <ul className="space-y-2">
            {review.challenges.map((c) => {
              const def = CHALLENGES[c.kind]
              const taken = activeKinds.has(c.kind)
              return (
                <li key={c.kind} className="flex items-center gap-3 rounded-[14px] bg-hf-card p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-hf-text">{def.title}</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-hf-text-4">
                      {def.rule}
                      {c.est_saving > 0 ? ` До ${formatMoney(c.est_saving)} экономии.` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={taken || start.isPending}
                    onClick={() =>
                      start.mutate(
                        { kind: c.kind, days: def.days, est_saving: c.est_saving },
                        { onSuccess: () => toast.success('Челлендж принят') },
                      )
                    }
                    className={cn(
                      'min-h-11 shrink-0 rounded-[11px] px-3.5 text-[13px] font-medium',
                      taken ? 'bg-hf-bar text-hf-text-4' : 'bg-hf-accent text-white',
                    )}
                  >
                    {taken ? 'Принят' : 'Принять'}
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}

      {active.length > 0 && (
        <>
          <p className="pt-1 font-mono text-[11px] tracking-[0.1em] text-hf-text-4 uppercase">Идут сейчас</p>
          <ul className="space-y-2">
            {active.map((c) => (
              <li key={c.id} className="rounded-[14px] bg-hf-card p-3">
                <p className="text-[13px] font-medium text-hf-text">{CHALLENGES[c.kind].title}</p>
                <p className="mt-0.5 text-[11px] text-hf-text-4">{progress(c)}</p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setStatus.mutate({ id: c.id, status: 'done' }, { onSuccess: () => toast.success('Засчитано') })}
                    className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-[11px] bg-hf-bar text-[13px] text-hf-text-2"
                  >
                    <Check className="h-4 w-4" /> Получилось
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatus.mutate({ id: c.id, status: 'failed' })}
                    className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-[11px] bg-hf-bar text-[13px] text-hf-text-3"
                  >
                    <X className="h-4 w-4" /> Не вышло
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </FormSheet>
  )
}
