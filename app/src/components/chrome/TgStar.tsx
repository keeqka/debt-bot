import { useId } from 'react'

/**
 * Звезда Telegram Stars: золотая пятиконечная со скруглёнными лучами — как
 * значок звёзд в самом Telegram, а не эмодзи ⭐ (у эмодзи свой рисунок на
 * каждой платформе, рядом с ценой он выглядит чужим).
 */
export function TgStar({ size = 16, className }: { size?: number; className?: string }) {
  const id = useId()
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-label="звёзды Telegram" role="img">
      <defs>
        <linearGradient id={`${id}-g`} x1="4" y1="3" x2="20" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFE259" />
          <stop offset="1" stopColor="#FFA51E" />
        </linearGradient>
      </defs>
      <path
        d="M12 3.2l2.62 5.46 5.98.8-4.38 4.16 1.1 5.94L12 16.72l-5.32 2.84 1.1-5.94L3.4 9.46l5.98-.8z"
        fill={`url(#${id}-g)`}
        stroke={`url(#${id}-g)`}
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path d="M12 7.4l1.2 2.5 2.72.36" fill="none" stroke="#FFF6C2" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" opacity=".75" />
    </svg>
  )
}
