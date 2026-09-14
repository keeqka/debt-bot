import { NavLink } from 'react-router-dom'
import { Home, CreditCard, Wallet, Target, MessageCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { haptic } from '@/lib/telegram'

const TABS = [
  { to: '/', label: 'Дашборд', icon: Home, end: true },
  { to: '/debts', label: 'Долги', icon: CreditCard, end: false },
  { to: '/finances', label: 'Финансы', icon: Wallet, end: false },
  { to: '/goals', label: 'Цели', icon: Target, end: false },
  { to: '/chat', label: 'Чат', icon: MessageCircle, end: false },
] as const

/**
 * Fixed bottom navigation — mobile-first per ТЗ §5: a Telegram Mini App is
 * opened almost exclusively on a phone, so primary navigation lives within
 * thumb reach at the bottom rather than in a top menu. Settings intentionally
 * has no tab here — it hangs off the avatar in TopBar instead.
 */
export function BottomTabBar() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around">
        {TABS.map(({ to, label, icon: Icon, end }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              onClick={() => haptic('light')}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors',
                  isActive ? 'text-primary' : 'text-muted-foreground',
                )
              }
            >
              <Icon className="h-5 w-5" strokeWidth={2} />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
