import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { Dashboard } from '@/routes/Dashboard'
import { Debts } from '@/routes/Debts'
import { Finances } from '@/routes/Finances'
import { Goals } from '@/routes/Goals'
import { Chat } from '@/routes/Chat'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route path="debts" element={<Debts />} />
          <Route path="finances" element={<Finances />} />
          <Route path="goals" element={<Goals />} />
          <Route path="chat" element={<Chat />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
