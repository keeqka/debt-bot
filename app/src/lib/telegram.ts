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

interface TelegramBackButton {
  isVisible: boolean
  show: () => void
  hide: () => void
  onClick: (cb: () => void) => void
  offClick: (cb: () => void) => void
}

interface TelegramMainButton {
  text: string
  isVisible: boolean
  isActive: boolean
  setText: (text: string) => void
  show: () => void
  hide: () => void
  enable: () => void
  disable: () => void
  onClick: (cb: () => void) => void
  offClick: (cb: () => void) => void
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
  BackButton?: TelegramBackButton
  MainButton?: TelegramMainButton
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

/**
 * Call once on app boot: signals readiness, expands to full height, and
 * keeps --tg-height in sync with Telegram's own stable viewport height (the
 * safe scrollable area — CSS 100dvh alone doesn't account for the bot's
 * chrome around the WebView). No theme sync anymore — Hlow Flow is dark-only.
 */
export function initTelegram() {
  const app = getTelegramWebApp()
  if (!app) return
  app.ready()
  app.expand()

  const setHeight = () => {
    if (app.viewportStableHeight) document.documentElement.style.setProperty('--tg-height', app.viewportStableHeight + 'px')
  }
  setHeight()
  app.onEvent('viewportChanged', setHeight)
}

export function haptic(style: 'light' | 'medium' | 'heavy' = 'light') {
  getTelegramWebApp()?.HapticFeedback?.impactOccurred(style)
}

export function closeApp() {
  getTelegramWebApp()?.close()
}

/**
 * Shows the native back chevron for a nested state (an open debt, a receipt
 * mid-review) and wires `onBack`. Returns a cleanup function — call it on
 * unmount/state-exit so the button doesn't linger into an unrelated screen.
 */
export function showBackButton(onBack: () => void): () => void {
  const btn = getTelegramWebApp()?.BackButton
  if (!btn) return () => {}
  btn.onClick(onBack)
  btn.show()
  return () => {
    btn.offClick(onBack)
    btn.hide()
  }
}

/**
 * Shows the native bottom action button for a screen with one primary action
 * ("Пересчитать план", "Сохранить"). Returns a cleanup function — same
 * lifecycle contract as showBackButton.
 */
export function showMainButton(text: string, onClick: () => void, opts?: { disabled?: boolean }): () => void {
  const btn = getTelegramWebApp()?.MainButton
  if (!btn) return () => {}
  btn.setText(text)
  opts?.disabled ? btn.disable() : btn.enable()
  btn.onClick(onClick)
  btn.show()
  return () => {
    btn.offClick(onClick)
    btn.hide()
  }
}
