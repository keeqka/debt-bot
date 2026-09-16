import { RotateCw } from 'lucide-react'
import { useRefreshStatus, useStatus } from '@/hooks/use-finance-data'
import { STATUS_META } from '@/lib/status'
import { cn } from '@/lib/utils'

/**
 * Полоса статуса на «Обзоре». Читает последнюю оценку из БД (её раз в неделю
 * считает бот) — экран никогда не зовёт Claude сам по факту открытия.
 *
 * Дизайн: тёмная карточка, как остальной интерфейс; цвет статуса живёт только
 * в тонкой полосе сверху, точке и подписи-лейбле — не в фоне всей плашки,
 * иначе она перебивает главную цифру, которая идёт сразу под ней.
 */
export function StatusBanner() {
  const { data: status, isLoading } = useStatus()
  const refresh = useRefreshStatus()

  if (isLoading) {
    return <div className="h-[72px] w-full animate-pulse rounded-[18px] bg-hf-card" />
  }

  if (!status) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-[18px] border border-dashed border-hf-track p-3.5">
        <p className="text-[13px] leading-snug text-hf-text-3">
          Оценки ещё нет — бот обновляет её раз в неделю. Можно запросить сейчас.
        </p>
        <button
          type="button"
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending}
          className="shrink-0 rounded-[10px] bg-hf-card px-3 py-2 text-[13px] text-hf-text-2 disabled:opacity-50"
        >
          {refresh.isPending ? 'Считаю…' : 'Оценить'}
        </button>
      </div>
    )
  }

  const meta = STATUS_META[status.status]

  return (
    <div className="overflow-hidden rounded-[18px] bg-hf-card">
      <div className={cn('h-1 w-full', meta.dot)} />
      <div className="flex items-start gap-3 p-3.5">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className={cn('font-mono text-[11px] tracking-[0.1em] uppercase', meta.text)}>{meta.label}</span>
            <span className="font-mono text-[11px] text-hf-text-4">{status.score}/100</span>
          </div>
          <p className="text-[13px] leading-snug font-medium text-hf-text-2">{status.headline}</p>
        </div>
        <button
          type="button"
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending}
          aria-label="Обновить оценку"
          className="shrink-0 rounded-md p-1 text-hf-text-4 disabled:opacity-50"
        >
          <RotateCw className={cn('h-4 w-4', refresh.isPending && 'animate-spin')} />
        </button>
      </div>
    </div>
  )
}
