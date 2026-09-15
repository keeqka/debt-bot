import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
// Overview and Receipt temporarily reuse the pre-redesign Dashboard/Finances
// screens under their new paths/labels — phases 2 and 4 replace their
// content. Debts and Chat keep their real routes and get reskinned in place
// (phases 3 and 5). Goals and the old general-ledger Finances route are
// dropped from navigation per the new 4-tab IA (files kept on disk, unlinked
// — see the redesign plan for why).
import { Dashboard as Overview } from '@/routes/Dashboard'
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
