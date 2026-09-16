import { useState, type ReactNode } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { TopBar } from '@/components/layout/TopBar'
import { BottomTabBar } from '@/components/layout/BottomTabBar'
import { Toaster } from '@/components/ui/sonner'
import { HeaderActionSetterContext } from '@/lib/header-action'
import { Onboarding } from '@/routes/Onboarding'
import { useCurrentUser } from '@/lib/auth'

/**
 * Подзаголовок шапки вместо заголовка-названия экрана: какой экран открыт,
 * уже видно по подсвеченному табу снизу — дублировать это заголовком значит
 * отдать единственное место, где может стоять имя продукта.
 */
const SUBTITLES: Record<string, string> = {
  '/overview': 'мини-апп',
  '/debts': 'план погашения',
  '/receipt': 'чеки и выписки',
  '/chat': 'читает твои цифры',
}

function subtitleFor(pathname: string) {
  const base = '/' + pathname.split('/')[1]
  return SUBTITLES[pathname] ?? SUBTITLES[base] ?? 'мини-апп'
}

export function AppShell() {
  const location = useLocation()
  const [headerAction, setHeaderAction] = useState<ReactNode>(null)
  const user = useCurrentUser()

  if (!user.onboarding_completed_at) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-hf-bg">
        <Onboarding onDone={() => {}} />
      </div>
    )
  }

  const isChat = location.pathname.startsWith('/chat')

  return (
    <HeaderActionSetterContext.Provider value={setHeaderAction}>
      <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-hf-bg">
        <TopBar subtitle={subtitleFor(location.pathname)} action={headerAction} face={isChat ? 'focused' : 'calm'} />
        <main className="pb-tabbar flex-1 px-4 pt-4.5">
          <Outlet />
        </main>
        <BottomTabBar />
        <Toaster position="top-center" />
      </div>
    </HeaderActionSetterContext.Provider>
  )
}
