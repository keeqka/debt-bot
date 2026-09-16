import type { ReactNode } from 'react'
import { MascotAvatar } from '@/components/Mascot'
import { closeApp } from '@/lib/telegram'

/**
 * Шапка как в макете: аватар маскота + «Hlow Flow / мини-апп» + «Закрыть».
 *
 * Профиля пользователя здесь больше нет (аватар с буквой и точкой статуса
 * убраны): в приложении один хозяйственный аккаунт на двоих, персональная
 * страница ничего не решала, а её аватар занимал место маскота — то есть
 * бренда. Настройки дохода и напоминаний переехали в «Обзор» и открываются
 * оттуда по делу, а не через безымянную иконку.
 *
 * subtitle задаёт экран (Chat ставит «читает твои цифры»), action — правый
 * слот (Chat кладёт туда очистку истории).
 */
export function TopBar({
  subtitle = 'мини-апп',
  action,
  face = 'calm',
}: {
  subtitle?: string
  action?: ReactNode
  face?: 'calm' | 'focused' | 'thinking'
}) {
  return (
    <header className="pt-safe sticky top-0 z-20 flex items-center justify-between gap-2.5 border-b border-hf-line bg-hf-bar px-4 pb-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <MascotAvatar size={28} expression={face} />
        <div className="min-w-0">
          <div className="truncate text-[15px] font-medium text-hf-text">Hlow Flow</div>
          <div className="truncate text-[11px] text-hf-text-4">{subtitle}</div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3.5">
        {action}
        <button type="button" onClick={closeApp} className="text-[13px] text-hf-accent-on-dark">
          Закрыть
        </button>
      </div>
    </header>
  )
}
