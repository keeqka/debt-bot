import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import { initTelegram } from '@/lib/telegram'
import { initSession } from '@/lib/auth'
import { ErrorBoundary } from '@/components/layout/ErrorBoundary'

initTelegram()

// Hlow Flow's design is dark-only (paper cards for user data sit on a dark
// shell) — there's no light/system mode to resolve anymore, unlike the old
// theme.ts toggle this replaced. Applied unconditionally so every shadcn
// primitive (Dialog/Select/Sheet), which still reads the `.dark` class,
// matches the new dark chrome around it.
document.documentElement.classList.add('dark')

const deepLinkParams = new URLSearchParams(window.location.search)

// Lets an embedder (e.g. the marketing site iframing this app in mock mode
// for a live product demo) deep-link to a screen via ?screen=/chat without
// needing SPA-fallback rewrites configured on whatever static host serves
// this build. Routing is hash-based (HashRouter — see App.tsx, chosen so
// Telegram's in-WebView back gesture doesn't fight pushState history), so
// the deep link becomes the hash directly rather than a real path rewrite.
const deepLinkScreen = deepLinkParams.get('screen')
if (deepLinkScreen) window.location.hash = deepLinkScreen

// Same embedding case again: an iframe is its own scrollable document, so a
// visitor's mouse wheel over it would scroll *this* page instead of the
// marketing site around it — stuck mid-scroll rather than reaching the rest
// of the landing page. Forward the wheel delta to the embedder via
// postMessage and swallow it here instead, so from the visitor's side the
// page behind the demo just scrolls normally, like any static screenshot
// would. window.parent === window (no-op) when this isn't actually embedded.
if (deepLinkParams.get('embedded') === '1' && window.parent !== window) {
  window.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault()
      window.parent.postMessage({ type: 'fincore-demo-scroll', deltaY: e.deltaY }, '*')
    },
    { passive: false },
  )
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 30, retry: 1 },
  },
})

// Resolve the Telegram session before the first render so every screen sees
// the real user id from the start rather than flashing the mock one. Seeds
// the query cache directly (see lib/auth.ts) so useCurrentUser() is a real
// reactive hook now, not a closure over a module variable nothing re-renders on.
await initSession(queryClient)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)
