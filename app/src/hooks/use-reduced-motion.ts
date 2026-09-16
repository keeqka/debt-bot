import { useEffect, useState } from 'react'

/**
 * One shared hook instead of a prefers-reduced-motion check in every
 * animated component (ANIMATIONS.md §8). Consumers keep their motion.*
 * elements mounted when this is true (so framer-motion layout transitions
 * still fire for reordering) but drop transition duration to 0, skip
 * repeating/looping animations (mascot thinking wobble), and make
 * useAnimatedNumber return the target value immediately instead of
 * stepping through a RAF loop.
 */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return reduced
}
