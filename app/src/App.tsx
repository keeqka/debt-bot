import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { Overview } from '@/routes/Overview'
import { Debts } from '@/routes/Debts'
import { Receipt } from '@/routes/Receipt'
import { Chat } from '@/routes/Chat'

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          {/* "/overview" is a real, explicit path (per FUNCTIONAL.md's #/overview) — index
              just redirects "/" there so a bare deep link still lands on the right tab. */}
          <Route index element={<Navigate to="/overview" replace />} />
          <Route path="overview" element={<Overview />} />
          <Route path="debts" element={<Debts />} />
          <Route path="receipt" element={<Receipt />} />
          <Route path="chat" element={<Chat />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}

export default App
