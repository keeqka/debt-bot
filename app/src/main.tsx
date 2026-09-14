import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import { initTelegram } from '@/lib/telegram'
import { initSession } from '@/lib/auth'
import { initTheme } from '@/lib/theme'

initTelegram()
initTheme()

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
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
