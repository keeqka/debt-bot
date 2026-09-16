import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useReducedMotion } from '@/hooks/use-reduced-motion'

export type Expression = 'calm' | 'focused' | 'happy' | 'alert' | 'thinking'

/**
 * Маскот «Чек» — обрывок кассовой ленты с лицом в верхней четверти.
 * viewBox 100×250 (пропорция ленты 2:5). Наклон −2.5° встроен в трансформ:
 * он никогда не стоит идеально ровно.
 *
 * Между состояниями меняются ТОЛЬКО глаза и рот. Бровей нет.
 */
const TORN =
  'M0,4 L8.33,0 L16.67,4 L25,0 L33.33,4 L41.67,0 L50,4 L58.33,0 L66.67,4 L75,0 L83.33,4 L91.67,0 L100,4 ' +
  'V246 L91.67,250 L83.33,246 L75,250 L66.67,246 L58.33,250 L50,246 L41.67,250 L33.33,246 L25,250 L16.67,246 L8.33,250 L0,246 Z'

const PRINT_ROWS = [
  { y: 97.5, labelW: 24, amountW: 16 },
  { y: 112.5, labelW: 34, amountW: 12 },
  { y: 127.5, labelW: 28, amountW: 18 },
  { y: 142.5, labelW: 20, amountW: 14 },
]

function faceShapes(expression: Expression) {
  if (expression === 'focused') {
    return (
      <>
        <rect x="21" y="29.5" width="15" height="4.5" rx="2.2" />
        <rect x="64" y="29.5" width="15" height="4.5" rx="2.2" />
        <rect x="43" y="55" width="14" height="3.5" rx="1.5" />
      </>
    )
  }
  if (expression === 'happy') {
    return (
      <>
        <path d="M20,36 a8,7 0 0 1 16,0 Z" />
        <path d="M64,36 a8,7 0 0 1 16,0 Z" />
        <path d="M34,52 h32 a16,9 0 0 1 -32,0 Z" />
      </>
    )
  }
  if (expression === 'alert') {
    return (
      <>
        <ellipse cx="28" cy="33" rx="8" ry="7.5" />
        <ellipse cx="72" cy="33" rx="8" ry="7.5" />
        <ellipse cx="50" cy="57" rx="6" ry="5.5" />
      </>
    )
  }
  if (expression === 'thinking') {
    return (
      <>
        <ellipse cx="33" cy="31" rx="7" ry="5.5" />
        <ellipse cx="77" cy="31" rx="7" ry="5.5" />
        <rect x="44" y="55" width="19" height="3.5" rx="1.5" transform="rotate(-6 53.5 56.75)" />
      </>
    )
  }
  return (
    <>
      <ellipse cx="28.5" cy="31" rx="7.5" ry="5.5" />
      <ellipse cx="71.5" cy="31" rx="7.5" ry="5.5" />
      <rect x="40" y="55" width="20" height="3.8" rx="1.6" />
    </>
  )
}

/**
 * Cross-fades between expressions (ANIMATIONS.md §1) instead of an instant
 * swap — the face is the one thing on the mascot that changes on its own,
 * so a hard cut reads as a glitch rather than an emotion change.
 */
function Face({ expression }: { expression: Expression }) {
  const reduced = useReducedMotion()
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.g
        key={expression}
        fill="#191C21"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: reduced ? 0 : 0.15, ease: 'easeOut' }}
      >
        {faceShapes(expression)}
      </motion.g>
    </AnimatePresence>
  )
}

export function Mascot({
  expression = 'calm',
  className,
  title = 'Чек — маскот Hlow Flow',
  bounce = false,
}: {
  expression?: Expression
  className?: string
  title?: string
  /**
   * One-shot celebratory bounce (ANIMATIONS.md §1, e.g. a debt just closed) —
   * flip this from false to true to play it; framer-motion only replays a
   * keyframe animation when its target actually changes, so the "already
   * shown" flag belongs in the calling screen's state, not here.
   */
  bounce?: boolean
}) {
  const reduced = useReducedMotion()
  const isThinking = expression === 'thinking'

  return (
    <svg viewBox="0 0 100 250" className={cn('h-full w-full', className)} role="img" aria-label={title}>
      <motion.g
        style={{ transformOrigin: '50px 125px' }}
        animate={{
          rotate: isThinking && !reduced ? [-2.5, -1.5, -2.5] : -2.5,
          y: bounce && !reduced ? [0, -6, 0] : 0,
        }}
        transition={{
          rotate:
            isThinking && !reduced
              ? { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }
              : { duration: reduced ? 0 : 0.3 },
          y: { duration: reduced ? 0 : 0.5, ease: 'easeOut' },
        }}
      >
        <path d={TORN} fill="#F6F1E8" />
        <rect x="20" y="11" width="60" height="4" rx="1" fill="#BDB4A5" />

        <Face expression={expression} />

        <rect x="20" y="82.5" width="60" height="1" fill="#DED6C8" />
        {PRINT_ROWS.map((r) => (
          <g key={r.y} fill="#D8D0C2">
            <rect x="20" y={r.y} width={r.labelW} height="3" rx="1" />
            <rect x={80 - r.amountW} y={r.y} width={r.amountW} height="3" rx="1" />
          </g>
        ))}

        <rect x="20" y="162.5" width="60" height="1" fill="#DED6C8" />
        <rect x="20" y="172" width="22" height="5.5" rx="1" fill="#BDB4A5" />
        {/* единственный синий элемент на маскоте — строка «итого» */}
        <rect x="54" y="172" width="26" height="5.5" rx="1" fill="#3C82C8" />

        <rect x="20" y="205" width="60" height="2.8" rx="1" fill="#E2DACC" />
        <rect x="20" y="217" width="34" height="2.8" rx="1" fill="#E2DACC" />
        <rect x="20" y="229" width="24" height="2.8" rx="1" fill="#E2DACC" />
      </motion.g>
    </svg>
  )
}

/**
 * Круглый кроп для аварки: видно рваный верх и лицо, дальше лента уходит за круг.
 * Проверено от 26px.
 */
export function MascotAvatar({
  expression = 'calm',
  size = 40,
  className,
}: {
  expression?: Expression
  size?: number
  className?: string
}) {
  return (
    <span
      className={cn('relative block shrink-0 overflow-hidden rounded-full bg-[#EDE9E1]', className)}
      style={{ width: size, height: size }}
    >
      <span className="absolute" style={{ left: '-57%', top: 0, width: '214%', height: '214%' }}>
        <Mascot expression={expression} />
      </span>
    </span>
  )
}
