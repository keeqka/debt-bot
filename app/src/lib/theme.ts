import { getTelegramWebApp } from '@/lib/telegram'

export type ThemeMode = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'finance-theme'

export function getStoredThemeMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  } catch {
    // localStorage unavailable (private mode, blocked cookies, ...) — fall back to system
  }
  return 'system'
}

/** "System" means Telegram's own light/dark choice when running inside it, else the OS preference. */
function resolveSystemIsDark(): boolean {
  const tg = getTelegramWebApp()
  if (tg) return tg.colorScheme === 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function applyThemeMode(mode: ThemeMode) {
  const isDark = mode === 'system' ? resolveSystemIsDark() : mode === 'dark'
  document.documentElement.classList.toggle('dark', isDark)
}

export function setThemeMode(mode: ThemeMode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // ignore — theme just won't persist across reloads
  }
  applyThemeMode(mode)
}

/**
 * Call once at boot: applies the stored (or system) theme and keeps it in
 * sync with OS/Telegram changes for as long as the user stays on "Системная".
 * A user who explicitly picked light/dark in Settings overrides both.
 */
export function initTheme() {
  applyThemeMode(getStoredThemeMode())

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getStoredThemeMode() === 'system') applyThemeMode('system')
  })

  getTelegramWebApp()?.onEvent('themeChanged', () => {
    if (getStoredThemeMode() === 'system') applyThemeMode('system')
  })
}
