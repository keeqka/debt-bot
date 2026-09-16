import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { NavLink } from 'react-router-dom'
import { MascotAvatar } from '@/components/Mascot'
import { haptic, closeApp } from '@/lib/telegram'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { cn } from '@/lib/utils'

const TABS = [
  { to: '/overview', label: 'Обзор', end: true },
  { to: '/debts', label: 'Долги', end: false },
  { to: '/receipt', label: 'Чеки', end: false },
  { to: '/chat', label: 'Чат', end: false },
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

/**
 * Tabs are plain colored squares, not icons — matches the actual design
 * reference (a screenshot of it, not the older fincore-redesign mock code,
 * whose "replace with icons from your set" comment turned out to be stale).
 * The active square carries the shared layoutId, so switching tabs slides
 * it to the new position instead of just toggling color in place
 * (ANIMATIONS.md §6's "sliding pill" — here the indicator IS the square).
 */
export function TabBar() {
  const reduced = useReducedMotion()
  return (
    <nav className="pb-safe shrink-0 flex border-t border-hf-line bg-hf-bar px-2 pt-2.5">
      {TABS.map(({ to, label, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={() => haptic('light')}
          className="flex flex-1 flex-col items-center gap-1.5"
        >
          {({ isActive }) =>
            isActive ? (
              <>
                <motion.span
                  layoutId="tab-pill"
                  className="h-5 w-5 rounded-md bg-hf-accent"
                  transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 30 }}
                />
                <span className="text-[11px] text-hf-text">{label}</span>
              </>
            ) : (
              <>
                <span className="h-5 w-5 rounded-md bg-[#3A3F47]" />
                <span className="text-[11px] text-hf-text-4">{label}</span>
              </>
            )
          }
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
