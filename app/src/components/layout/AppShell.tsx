import { Outlet, useLocation } from 'react-router-dom'
import { TopBar } from '@/components/layout/TopBar'
import { BottomTabBar } from '@/components/layout/BottomTabBar'
import { Toaster } from '@/components/ui/sonner'

const TITLES: Record<string, string> = {
  '/': 'Дашборд',
  '/debts': 'Долги',
  '/finances': 'Финансы',
  '/goals': 'Цели',
  '/chat': 'AI-консультант',
}

function titleFor(pathname: string) {
  if (TITLES[pathname]) return TITLES[pathname]
  const base = '/' + pathname.split('/')[1]
  return TITLES[base] ?? 'Финансы'
}

export function AppShell() {
  const location = useLocation()

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-background">
      <TopBar title={titleFor(location.pathname)} />
      <main className="pb-tabbar flex-1 px-4 pt-4">
        <Outlet />
      </main>
      <BottomTabBar />
      <Toaster position="top-center" />
    </div>
  )
}
