import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Home, CreditCard, Receipt as ReceiptIcon, MessageCircle } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { MascotAvatar } from '@/components/Mascot'
import { haptic, closeApp } from '@/lib/telegram'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { cn } from '@/lib/utils'

const TABS = [
  { to: '/overview', label: 'Обзор', icon: Home, end: true },
  { to: '/debts', label: 'Долги', icon: CreditCard, end: false },
  { to: '/receipt', label: 'Чеки', icon: ReceiptIcon, end: false },
  { to: '/chat', label: 'Чат', icon: MessageCircle, end: false },
] as const

export function TopBar({ title, subtitle, avatar = false }: { title: string; subtitle?: string; avatar?: boolean }) {
  return (
    <header className="flex items-center justify-between gap-2.5 bg-hf-bar px-4 pt-3.5 pb-3">
      <div className="flex min-w-0 items-center gap-2.5">
        {avatar ? <MascotAvatar size={28} /> : null}
        <div className="min-w-0">
          <div className="truncate text-[15px] font-medium text-hf-text">{title}</div>
          {subtitle ? <div className="truncate text-[11px] text-hf-text-4">{subtitle}</div> : null}
        </div>
      </div>
      <button type="button" onClick={closeApp} className="text-[13px] text-hf-accent-on-dark">
        Закрыть
      </button>
    </header>
  )
}

export function TabBar() {
  const reduced = useReducedMotion()
  return (
    <nav className="pb-safe shrink-0 flex border-t border-hf-line bg-hf-bar px-2 pt-2.5">
      {TABS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={() => haptic('light')}
          className="flex flex-1 flex-col items-center gap-1.5"
        >
          {({ isActive }) => (
            <>
              <span className="relative flex h-8 w-8 items-center justify-center">
                {isActive && (
                  <motion.span
                    layoutId="tab-pill"
                    className="absolute inset-0 rounded-full bg-hf-accent/15"
                    transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
                <Icon className={cn('relative h-5 w-5', isActive ? 'text-hf-accent' : 'text-hf-text-4')} strokeWidth={2} />
              </span>
              <span className={cn('text-[11px]', isActive ? 'text-hf-text' : 'text-hf-text-4')}>{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

/** Экран: панель сверху, скроллящийся контент, панель действий снизу. */
export function Screen({ top, children, bottom }: { top: ReactNode; children: ReactNode; bottom?: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {top}
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-4 py-4.5">{children}</div>
      {bottom}
    </div>
  )
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="font-mono text-[11px] tracking-[0.1em] text-hf-text-4 uppercase">{children}</div>
}

export function ActionBar({ children }: { children: ReactNode }) {
  return <div className="flex gap-2.5 border-t border-hf-line bg-hf-bar px-4 pt-3 pb-4.5">{children}</div>
}

export function Action({
  children,
  onClick,
  variant = 'accent',
  disabled = false,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'accent' | 'muted'
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        haptic('medium')
        onClick?.()
      }}
      className={cn(
        'flex-1 rounded-[13px] py-3.5 text-[15px] transition-transform duration-150 active:scale-[0.97] disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:scale-100',
        variant === 'accent' ? 'bg-hf-accent font-medium text-white' : 'bg-hf-card text-hf-text-2',
      )}
    >
      {children}
    </button>
  )
}
