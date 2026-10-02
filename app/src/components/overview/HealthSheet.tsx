import { useNavigate } from 'react-router-dom'
import { Check, Circle, Minus } from 'lucide-react'
import { FormSheet } from '@/components/chrome/FormSheet'
import { ProgressBar } from '@/components/chrome/ProgressBar'
import { MascotAvatar } from '@/components/Mascot'
import { useHealth, useSetHealthOverride } from '@/hooks/use-finance-data'
import type { HealthItem } from '@/lib/health'
import { cn } from '@/lib/utils'

/**
 * Финансовое здоровье (11): семь пунктов, считаются из данных приложения.
 * «Не про меня» выпадает из знаменателя; страховка отмечается вручную. Внизу —
 * реплика маскота про ближайший к выполнению пункт и действие.
 */
export function HealthSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const health = useHealth()
  const setOverride = useSetHealthOverride()
  const navigate = useNavigate()

  function go(to: string) {
    onOpenChange(false)
    navigate(to)
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={health ? `Финансовое здоровье · ${health.done}/${health.total}` : 'Финансовое здоровье'}
      footer={
        <button type="button" onClick={() => onOpenChange(false)} className="min-h-11 w-full rounded-[13px] bg-hf-card py-3 text-[15px] text-hf-text-2">
          Готово
        </button>
      }
    >
      {!health ? (
        <div className="h-64 animate-pulse rounded-[18px] bg-hf-card" />
      ) : (
        <>
          <ul className="space-y-2">
            {health.items.map((item) => (
              <Row
                key={item.id}
                item={item}
                onAction={go}
                onToggleNa={() => setOverride.mutate({ item: item.id, status: item.state === 'na' ? null : 'na' })}
                onToggleDone={() => setOverride.mutate({ item: item.id, status: item.state === 'done' ? null : 'done' })}
              />
            ))}
          </ul>

          <div className="flex items-start gap-3 rounded-[16px] bg-hf-card p-3.5">
            <MascotAvatar size={34} expression={health.next ? 'focused' : 'happy'} />
            <div className="min-w-0 space-y-2 text-[13px] leading-snug text-hf-text-2">
              {health.next ? (
                <>
                  <p>
                    Ближе всего — «{health.next.title}». {health.next.detail}
                  </p>
                  {health.next.action && (
                    <button type="button" onClick={() => go(health.next!.action!.to)} className="min-h-11 text-[13px] font-medium text-hf-accent-on-dark">
                      {health.next.action.label} →
                    </button>
                  )}
                </>
              ) : (
                <p>Все пункты закрыты. Дальше только держать темп.</p>
              )}
            </div>
          </div>
        </>
      )}
    </FormSheet>
  )
}

function Row({ item, onAction, onToggleNa, onToggleDone }: { item: HealthItem; onAction: (to: string) => void; onToggleNa: () => void; onToggleDone: () => void }) {
  const na = item.state === 'na'
  return (
    <li className={cn('space-y-2 rounded-[14px] bg-hf-card p-3', na && 'opacity-60')}>
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full',
            item.state === 'done' ? 'bg-hf-ok text-hf-bg' : 'text-hf-text-4',
          )}
          aria-hidden="true"
        >
          {item.state === 'done' ? <Check className="h-3 w-3" /> : na ? <Minus className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn('text-[13px] font-medium text-hf-text', na && 'line-through')}>{item.title}</p>
          <p className="mt-0.5 text-[11px] leading-snug text-hf-text-4">{na ? 'Отмечено «не про меня» — не входит в счёт.' : item.detail}</p>
        </div>
      </div>
      {item.state === 'todo' && item.progress > 0 && item.progress < 1 && <ProgressBar pct={item.progress * 100} />}
      <div className="flex flex-wrap gap-2">
        {item.state === 'todo' && item.action && (
          <button type="button" onClick={() => onAction(item.action!.to)} className="min-h-11 rounded-[10px] bg-hf-bar px-3 text-[12px] text-hf-accent-on-dark">
            {item.action.label}
          </button>
        )}
        {item.manual && !na && (
          <button type="button" onClick={onToggleDone} className="min-h-11 rounded-[10px] bg-hf-bar px-3 text-[12px] text-hf-text-2">
            {item.state === 'done' ? 'Снять отметку' : 'Отметить: есть'}
          </button>
        )}
        <button type="button" onClick={onToggleNa} className="min-h-11 rounded-[10px] px-3 text-[12px] text-hf-text-4">
          {na ? 'Вернуть в счёт' : 'Не про меня'}
        </button>
      </div>
    </li>
  )
}
