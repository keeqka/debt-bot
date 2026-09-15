/**
 * Thin wrapper around the Telegram WebApp bridge (loaded via the
 * `telegram-web-app.js` script tag in index.html). Falls back to sane
 * defaults when opened outside Telegram (plain browser during dev).
 */

interface TelegramWebAppUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
}

interface TelegramWebApp {
  initData: string
  initDataUnsafe: { user?: TelegramWebAppUser; auth_date?: number }
  colorScheme: 'light' | 'dark'
  themeParams: Record<string, string>
  viewportStableHeight: number
  ready: () => void
  expand: () => void
  close: () => void
  setHeaderColor: (color: string) => void
  setBackgroundColor: (color: string) => void
  onEvent: (event: string, handler: () => void) => void
  offEvent: (event: string, handler: () => void) => void
  HapticFeedback?: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void
  }
}

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp }
  }
}

export function getTelegramWebApp(): TelegramWebApp | null {
  return typeof window !== 'undefined' ? (window.Telegram?.WebApp ?? null) : null
}

export function isInsideTelegram(): boolean {
  return getTelegramWebApp() !== null
}

/** Raw initData string to send to /functions/v1/auth-telegram for HMAC verification. */
export function getInitData(): string | null {
  return getTelegramWebApp()?.initData || null
}

export function getTelegramUser(): TelegramWebAppUser | null {
  return getTelegramWebApp()?.initDataUnsafe.user ?? null
}

/** Call once on app boot: signals readiness and expands to full height. Theme sync lives in lib/theme.ts. */
export function initTelegram() {
  const app = getTelegramWebApp()
  if (!app) return
  app.ready()
  app.expand()
}

export function haptic(style: 'light' | 'medium' | 'heavy' = 'light') {
  getTelegramWebApp()?.HapticFeedback?.impactOccurred(style)
}

export function closeApp() {
  getTelegramWebApp()?.close()
}
