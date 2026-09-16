import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from '@/hooks/use-reduced-motion'

/**
 * Counts from the old value to the new one instead of an instant text swap
 * (ANIMATIONS.md §2) — e.g. Overview's main "how much is left" number after
 * saving a receipt. Rounds each frame to the nearest 10 (currency here never
 * shows fractions) so the digits settle rather than flicker on the last step.
 *
 * The very first render never animates — prevRef starts at `value`, not 0 —
 * so the number doesn't "count up from zero" every time the screen mounts,
 * only when it actually changes while already on screen.
 */
export function useAnimatedNumber(value: number, duration = 600) {
  const [display, setDisplay] = useState(value)
  const prevRef = useRef(value)
  const reduced = useReducedMotion()

  useEffect(() => {
    const from = prevRef.current
    const to = value
    if (from === to) return
    if (reduced) {
      setDisplay(to)
      prevRef.current = to
      return
    }
    const start = performance.now()
    let raf: number
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(Math.round((from + (to - from) * eased) / 10) * 10)
      if (t < 1) raf = requestAnimationFrame(tick)
      else prevRef.current = to
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration, reduced])

  return display
}
