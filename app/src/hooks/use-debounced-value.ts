import { useEffect, useState } from 'react'

/** Значение с задержкой: тяжёлый пересчёт (слайдер → симуляция) не бежит на каждый пиксель. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(t)
  }, [value, delayMs])
  return debounced
}
