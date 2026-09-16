import type { ReactNode } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'

/**
 * Заменяет shadcn AlertDialog везде в мини-аппе. AlertDialog рисует центральный
 * попап (rounded-xl, ring-1, десктопная форма) — на телефоне внутри тёмного
 * приложения это читается как чужой слой поверх интерфейса, тем более рядом
 * с BudgetSetupSheet и формами, которые все — нижние листы. Один компонент,
 * один способ спросить «точно?» во всём приложении.
 */
export function ConfirmSheet({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive = true,
  pending = false,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: ReactNode
  confirmLabel: string
  destructive?: boolean
  pending?: boolean
  onConfirm: () => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-[24px] border-hf-line bg-hf-bg" showCloseButton={false}>
        <SheetHeader className="px-4 pt-1 pb-0">
          <SheetTitle className="text-[15px] font-medium text-hf-text">{title}</SheetTitle>
          <SheetDescription className="text-[13px] leading-relaxed text-hf-text-3">{description}</SheetDescription>
        </SheetHeader>
        <div className="flex gap-2.5 px-4 pb-8">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex-1 rounded-[13px] bg-hf-card py-3.5 text-[15px] text-hf-text-2"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className={
              'flex-1 rounded-[13px] py-3.5 text-[15px] font-medium disabled:opacity-50 ' +
              (destructive ? 'bg-hf-warn text-white' : 'bg-hf-accent text-white')
            }
          >
            {pending ? 'Секунду…' : confirmLabel}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
