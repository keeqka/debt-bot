import { cn } from '@/lib/utils'

const FILL: Record<string, string> = {
  accent: 'bg-hf-accent',
  soft: 'bg-[#8FAFCE]',
  faint: 'bg-[#C5D6E8]',
  warn: 'bg-hf-warn',
}

/**
 * Заполнение анимируется через CSS transition, не framer-motion — фреймворк
 * не входит в зависимости этого проекта, а тут анимируется только ширина.
 * prefers-reduced-motion отключает переход целиком.
 */
export function ProgressBar({
  pct,
  tone = 'accent',
  onPaper = false,
  height = 7,
  delayMs = 0,
}: {
  pct: number
  tone?: keyof typeof FILL
  onPaper?: boolean
  height?: number
  /** e.g. the chat data-widget's bars starting 150ms after the bubble itself (ANIMATIONS.md §5) — text first, numbers after. */
  delayMs?: number
}) {
  return (
    <div className={cn('overflow-hidden rounded-full', onPaper ? 'bg-hf-receipt-line' : 'bg-hf-track')} style={{ height }}>
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-400 ease-out motion-reduce:transition-none',
          FILL[tone],
        )}
        style={{ width: Math.min(pct, 100) + '%', transitionDelay: delayMs ? `${delayMs}ms` : undefined }}
      />
    </div>
  )
}
