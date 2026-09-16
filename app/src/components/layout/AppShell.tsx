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

  // Fixed to the real Telegram viewport height (--tg-height, lib/telegram.ts)
  // rather than min-h-dvh: TopBar/BottomTabBar need to be actual non-scrolling
  // flex siblings pinned top and bottom, with only the middle region
  // scrolling — a min-h-dvh shell just grows with content instead, so both
  // bars scroll away with everything else on any screen taller than one page.
  if (!user.onboarding_completed_at) {
    return (
      <div className="mx-auto flex max-w-md flex-col bg-hf-bg" style={{ height: 'var(--tg-height, 100dvh)' }}>
        <Onboarding onDone={() => {}} />
      </div>
    )
  }

  const isChat = location.pathname.startsWith('/chat')

  return (
    <HeaderActionSetterContext.Provider value={setHeaderAction}>
      <div className="mx-auto flex max-w-md flex-col bg-hf-bg" style={{ height: 'var(--tg-height, 100dvh)' }}>
        <TopBar subtitle={subtitleFor(location.pathname)} action={headerAction} face={isChat ? 'focused' : 'calm'} />
        <main className="min-h-0 flex-1 overflow-y-auto px-4 pt-4.5">
          <Outlet />
        </main>
        <BottomTabBar />
        <Toaster position="top-center" />
      </div>
    </HeaderActionSetterContext.Provider>
  )
}
