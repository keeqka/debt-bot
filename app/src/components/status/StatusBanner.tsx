import { AlertTriangle, Sparkles, RotateCw } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useRefreshStatus, useStatus } from '@/hooks/use-finance-data'
import { STATUS_META } from '@/lib/status'
import { cn } from '@/lib/utils'

/**
 * Dashboard status banner — the colored top strip described in ТЗ §5/§6.2.
 * Purely reads the last AI-computed status from the DB (updated weekly by
 * cron); the refresh button is the only other way to get a fresh one — this
 * screen never calls Claude on its own just because it was opened.
 */
export function StatusBanner() {
  const { data: status, isLoading } = useStatus()
  const refresh = useRefreshStatus()

  if (isLoading) {
    return <Skeleton className="h-24 w-full rounded-2xl" />
  }

  if (!status) {
    return (
      <Card className="border-dashed py-0">
        <CardContent className="flex items-center justify-between gap-3 p-4">
          <p className="text-muted-foreground text-sm">Оценки ещё нет — обновляется раз в неделю ботом, или запросите сейчас.</p>
          <Button size="sm" variant="outline" onClick={() => refresh.mutate()} disabled={refresh.isPending} className="shrink-0">
            <RotateCw className={cn('h-3.5 w-3.5', refresh.isPending && 'animate-spin')} />
            Оценить
          </Button>
        </CardContent>
      </Card>
    )
  }

  const meta = STATUS_META[status.status]
  const Icon = status.score >= 60 ? Sparkles : AlertTriangle

  return (
    <Card className={cn('overflow-hidden border-0 py-0', meta.bg)}>
      <div className={cn('h-1.5 w-full', meta.dot)} />
      <CardContent className="flex items-start gap-3 p-4">
        <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', meta.text)} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className={cn('text-xs font-semibold uppercase tracking-wide', meta.text)}>{meta.label}</span>
            <span className="text-muted-foreground text-xs">{status.score}/100</span>
          </div>
          <p className="text-sm leading-snug font-medium">{status.headline}</p>
        </div>
        <button
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending}
          aria-label="Обновить оценку"
          className="text-muted-foreground hover:text-foreground shrink-0 rounded-md p-1 disabled:opacity-50"
        >
          <RotateCw className={cn('h-4 w-4', refresh.isPending && 'animate-spin')} />
        </button>
      </CardContent>
    </Card>
  )
}
