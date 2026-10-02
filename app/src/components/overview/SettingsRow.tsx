import { ChevronRight } from 'lucide-react'

/** Общий вид строк-ссылок на «Обзоре»: одна высота, один отступ, видимый фокус при навигации с клавиатуры. */
export const rowClass =
  'flex min-h-11 w-full items-center justify-between gap-3 rounded-[16px] bg-hf-card px-3.5 py-2.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hf-accent'

/** Строка «Настройки» — открывает BudgetSetupSheet; дублирует шестерёнку в шапке «Обзора». */
export function SettingsRow({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={rowClass}>
      <span className="min-w-0">
        <span className="block font-mono text-[11px] tracking-[0.1em] text-hf-text-4 uppercase">Настройки</span>
        <span className="mt-1 block text-xs text-hf-text-3">Доход, режим бота, стратегии, категории</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-hf-text-4" />
    </button>
  )
}
