import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Светлая «бумажная» карточка = данные, пришедшие из чеков и выписок.
 * Тёмные поверхности — интерфейс и слова бота. Это правило держит всю навигацию по смыслу.
 */
export function Paper({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-[18px] bg-hf-receipt p-4 text-hf-ink', className)}>{children}</div>
}

export function PaperRow({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: string
  tone?: 'default' | 'accent' | 'warn'
}) {
  const valueTone = tone === 'accent' ? 'text-hf-accent-ink' : tone === 'warn' ? 'text-hf-warn-ink' : 'text-hf-ink'
  return (
    <div className="flex justify-between gap-2.5 text-[13px]">
      <span>{label}</span>
      <span className={cn('font-mono', valueTone)}>{value}</span>
    </div>
  )
}
