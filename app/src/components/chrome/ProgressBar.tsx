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
}: {
  pct: number
  tone?: keyof typeof FILL
  onPaper?: boolean
  height?: number
}) {
  return (
    <div className={cn('overflow-hidden rounded-full', onPaper ? 'bg-hf-receipt-line' : 'bg-hf-track')} style={{ height }}>
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-400 ease-out motion-reduce:transition-none',
          FILL[tone],
        )}
        style={{ width: Math.min(pct, 100) + '%' }}
      />
    </div>
  )
}
