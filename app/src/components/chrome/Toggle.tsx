import { cn } from '@/lib/utils'

/**
 * Переключатель. Ручка прибита к левому краю (left-0.5) и сдвигается
 * transform'ом — без явного left абсолютный элемент внутри <button> встаёт
 * по центру кнопки, и выключенный переключатель выглядел включённым.
 */
export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean
  onChange?: (next: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={cn(
        'relative inline-block h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50',
        checked ? 'bg-hf-accent' : 'bg-hf-track',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 left-0.5 block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 motion-reduce:transition-none',
          checked ? 'translate-x-5' : 'translate-x-0',
        )}
      />
    </button>
  )
}

/** Та же ручка без своей кнопки — когда переключатель лежит внутри строки-кнопки. */
export function ToggleVisual({ checked }: { checked: boolean }) {
  return (
    <span className={cn('relative inline-block h-6 w-11 shrink-0 rounded-full transition-colors', checked ? 'bg-hf-accent' : 'bg-hf-track')}>
      <span
        className={cn(
          'absolute top-0.5 left-0.5 block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 motion-reduce:transition-none',
          checked ? 'translate-x-5' : 'translate-x-0',
        )}
      />
    </span>
  )
}
