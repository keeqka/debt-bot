import type { ReactNode } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

/** Общая обёртка нижнего листа для форм: заголовок, скроллящееся тело, прибитая кнопка сохранения. */
export function FormSheet({
  open,
  onOpenChange,
  title,
  children,
  footer,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="flex max-h-[85vh] flex-col rounded-t-[24px] border-hf-line bg-hf-bg p-0">
        <SheetHeader className="shrink-0 px-4 pt-1 pb-0">
          <SheetTitle className="text-[15px] font-medium text-hf-text">{title}</SheetTitle>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-4 py-4">{children}</div>
        <div className="shrink-0 border-t border-hf-line px-4 pt-3 pb-6">{footer}</div>
      </SheetContent>
    </Sheet>
  )
}

export function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] text-hf-text-4">{label}</span>
      {children}
    </label>
  )
}

export const formInputClass =
  'h-10 w-full rounded-[10px] border border-hf-line bg-hf-card px-3 text-[13px] text-hf-text placeholder:text-hf-text-4 focus:border-hf-accent focus:outline-none'

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <div className="flex rounded-[12px] bg-hf-card p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'flex-1 rounded-[9px] py-2 text-[13px] transition-colors',
            value === o.value ? 'bg-hf-accent font-medium text-white' : 'text-hf-text-4',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function SaveButton({ pending, pendingLabel, children }: { pending: boolean; pendingLabel: string; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-[13px] bg-hf-accent py-3.5 text-[15px] font-medium text-white disabled:opacity-50"
    >
      {pending ? pendingLabel : children}
    </button>
  )
}
