import { useState, type ReactNode } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { TopBar } from '@/components/layout/TopBar'
import { BottomTabBar } from '@/components/layout/BottomTabBar'
import { Toaster } from '@/components/ui/sonner'
import { HeaderActionSetterContext } from '@/lib/header-action'
import { Onboarding } from '@/routes/Onboarding'
import { useCurrentUser } from '@/lib/auth'

const TITLES: Record<string, string> = {
  '/overview': 'Обзор',
  '/debts': 'Долги',
  '/receipt': 'Чеки',
  '/chat': 'Чат',
}

function titleFor(pathname: string) {
  if (TITLES[pathname]) return TITLES[pathname]
  const base = '/' + pathname.split('/')[1]
  return TITLES[base] ?? 'Hlow Flow'
}

export function AppShell() {
  const location = useLocation()
  const [headerAction, setHeaderAction] = useState<ReactNode>(null)
  const user = useCurrentUser()

  if (!user.onboarding_completed_at) {
    // useUpdateUser's onSuccess writes onboarding_completed_at straight into the
    // query cache, which re-renders this component past the gate on its own —
    // onDone needs nothing to do.
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-hf-bg">
        <Onboarding onDone={() => {}} />
      </div>
    )
  }

  return (
    <HeaderActionSetterContext.Provider value={setHeaderAction}>
      <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-hf-bg">
        <TopBar title={titleFor(location.pathname)} action={headerAction} />
        <main className="pb-tabbar flex-1 px-4 pt-4">
          <Outlet />
        </main>
        <BottomTabBar />
        <Toaster position="top-center" />
      </div>
    </HeaderActionSetterContext.Provider>
  )
}
