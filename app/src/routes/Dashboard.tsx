import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Camera, MessageCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBanner } from '@/components/status/StatusBanner'
import { CategoryDonutChart } from '@/components/charts/CategoryDonutChart'
import { useDebts, useExpenses, useIncomes, useCategories } from '@/hooks/use-finance-data'
import { formatMoney } from '@/lib/format'

function isThisMonth(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
}

export function Dashboard() {
  const navigate = useNavigate()
  const { data: debts, isLoading: debtsLoading } = useDebts()
  const { data: expenses, isLoading: expensesLoading } = useExpenses()
  const { data: incomes, isLoading: incomesLoading } = useIncomes()
  const { data: categories } = useCategories()

  const monthExpenses = useMemo(() => expenses?.filter((e) => isThisMonth(e.spent_at)) ?? [], [expenses])
  const monthIncomes = useMemo(() => incomes?.filter((i) => isThisMonth(i.received_at)) ?? [], [incomes])

  const totalExpense = monthExpenses.reduce((sum, e) => sum + e.amount, 0)
  const totalIncome = monthIncomes.reduce((sum, i) => sum + i.amount, 0)
  const totalDebt = debts?.filter((d) => d.status === 'active').reduce((sum, d) => sum + d.current_balance, 0) ?? 0
  const balance = totalIncome - totalExpense

  const isLoading = debtsLoading || expensesLoading || incomesLoading

  return (
    <div className="space-y-5 pb-6">
      <StatusBanner />

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Баланс месяца" value={isLoading ? null : formatMoney(balance)} accent={balance >= 0} />
        <StatCard label="Общий долг" value={isLoading ? null : formatMoney(totalDebt)} />
        <StatCard label="Доход" value={isLoading ? null : formatMoney(totalIncome)} muted />
        <StatCard label="Расход" value={isLoading ? null : formatMoney(totalExpense)} muted />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <QuickAction icon={Plus} label="Расход" onClick={() => navigate('/finances?add=manual')} />
        <QuickAction icon={Camera} label="Фото чека" onClick={() => navigate('/finances?add=receipt')} />
        <QuickAction icon={MessageCircle} label="Спросить AI" onClick={() => navigate('/chat')} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Расходы по категориям · этот месяц</CardTitle>
        </CardHeader>
        <CardContent>
          {categories ? <CategoryDonutChart expenses={monthExpenses} categories={categories} /> : <Skeleton className="h-40 w-full" />}
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({ label, value, accent, muted }: { label: string; value: string | null; accent?: boolean; muted?: boolean }) {
  return (
    <Card className="py-0">
      <CardContent className="space-y-1 p-4">
        <p className="text-muted-foreground text-xs">{label}</p>
        {value === null ? (
          <Skeleton className="h-6 w-24" />
        ) : (
          <p
            className={
              'text-lg font-semibold ' +
              (accent === undefined ? (muted ? 'text-muted-foreground' : '') : accent ? 'text-status-green' : 'text-status-red')
            }
          >
            {value}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function QuickAction({ icon: Icon, label, onClick }: { icon: typeof Plus; label: string; onClick: () => void }) {
  return (
    <Button variant="outline" className="h-auto flex-col gap-1.5 rounded-2xl py-3" onClick={onClick}>
      <Icon className="h-4 w-4" />
      <span className="text-xs">{label}</span>
    </Button>
  )
}
