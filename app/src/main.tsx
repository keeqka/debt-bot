import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import { initTelegram } from '@/lib/telegram'
import { initSession } from '@/lib/auth'
import { initTheme } from '@/lib/theme'
import { ErrorBoundary } from '@/components/layout/ErrorBoundary'

initTelegram()
initTheme()

// Lets an embedder (e.g. the marketing site iframing this app in mock mode
// for a live product demo) deep-link to a screen via ?screen=/chat without
// needing SPA-fallback rewrites configured on whatever static host serves
// this build — rewritten to a real path before BrowserRouter ever reads it.
const deepLinkScreen = new URLSearchParams(window.location.search).get('screen')
if (deepLinkScreen) window.history.replaceState(null, '', deepLinkScreen)

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 30, retry: 1 },
  },
})

// Resolve the Telegram session before the first render so every screen sees
// the real user id from the start rather than flashing the mock one.
await initSession()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)
