import { AlertTriangle, Sparkles } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useStatus } from '@/hooks/use-finance-data'
import { STATUS_META } from '@/lib/status'
import { cn } from '@/lib/utils'

/** Dashboard status banner — the colored top strip described in ТЗ §5/§6.2. */
export function StatusBanner() {
  const { data: status, isLoading } = useStatus()

  if (isLoading || !status) {
    return <Skeleton className="h-24 w-full rounded-2xl" />
  }

  const meta = STATUS_META[status.status]
  const Icon = status.score >= 60 ? Sparkles : AlertTriangle

  return (
    <Card className={cn('overflow-hidden border-0 py-0', meta.bg)}>
      <div className={cn('h-1.5 w-full', meta.dot)} />
      <CardContent className="flex items-start gap-3 p-4">
        <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', meta.text)} />
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className={cn('text-xs font-semibold uppercase tracking-wide', meta.text)}>{meta.label}</span>
            <span className="text-muted-foreground text-xs">{status.score}/100</span>
          </div>
          <p className="text-sm leading-snug font-medium">{status.headline}</p>
        </div>
      </CardContent>
    </Card>
  )
}
