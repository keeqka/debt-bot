import { useState, type ReactNode } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { useStatus } from '@/hooks/use-finance-data'
import { STATUS_META } from '@/lib/status'
import { cn } from '@/lib/utils'
import { SettingsPanel } from '@/components/settings/SettingsPanel'
import { useCurrentUser } from '@/lib/auth'

/**
 * Header with the current user's avatar + a live status dot (ТЗ §5: "точка
 * на аватарке" as part of the status color threading through the whole UI).
 * Settings lives behind this avatar rather than a bottom-tab slot.
 */
export function TopBar({ title, action }: { title: string; action?: ReactNode }) {
  const { data: status } = useStatus()
  const user = useCurrentUser()
  const [open, setOpen] = useState(false)
  const meta = status ? STATUS_META[status.status] : null
  const initials = user.display_name.slice(0, 1).toUpperCase()

  return (
    <header className="pt-safe sticky top-0 z-20 flex items-center justify-between border-b border-hf-line bg-hf-bar px-4 pb-3">
      <h1 className="text-[15px] font-medium text-hf-text">{title}</h1>
      <div className="flex items-center gap-3">
        {action}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger className="relative" aria-label="Профиль и настройки">
            <Avatar className="h-9 w-9">
              {user.avatar_url && <AvatarImage src={user.avatar_url} alt={user.display_name} />}
              <AvatarFallback className="bg-hf-card text-hf-text text-sm font-semibold">{initials}</AvatarFallback>
            </Avatar>
            {meta && (
              <span
                className={cn('absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-hf-bar', meta.dot)}
                aria-label={`Статус: ${meta.label}`}
              />
            )}
          </SheetTrigger>
          <SheetContent side="right" className="w-full sm:max-w-sm">
            <SheetHeader>
              <SheetTitle>Профиль</SheetTitle>
            </SheetHeader>
            <SettingsPanel />
          </SheetContent>
        </Sheet>
      </div>
    </header>
  )
}
