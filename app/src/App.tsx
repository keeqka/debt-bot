import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
// Receipt temporarily reuses the pre-redesign Finances screen under its new
// path/label — phase 4 replaces its content. Debts and Chat keep their real
// routes and get reskinned in place (phases 3 and 5). Goals and the old
// general-ledger Finances route are dropped from navigation per the new
// 4-tab IA (files kept on disk, unlinked — see the redesign plan for why).
import { Overview } from '@/routes/Overview'
import { Debts } from '@/routes/Debts'
import { Finances as Receipt } from '@/routes/Finances'
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
