import { env } from '@/lib/env'

export const REPORT_PATH = /^\/report\/([A-Za-z0-9_-]{32})\/?$/

/** Ссылка на файл .html — отдаёт его вложением, пока жива сама ссылка. */
export function reportDownloadUrl(token: string) {
  return `${env.supabaseUrl}/functions/v1/report-view?id=${token}&download=1`
}

export type PublicReport = { status: 'ok'; html: string; expiresAt: string } | { status: 'expired' } | { status: 'error' }

/** Публичная «Выписка» по токену из адреса — без сессии, поэтому не через callFunction (тот ждёт вход в Telegram). */
export async function getPublicReport(token: string): Promise<PublicReport> {
  if (!env.supabaseUrl) return { status: 'error' }
  try {
    const res = await fetch(`${env.supabaseUrl}/functions/v1/report-view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.supabaseAnonKey}` },
      body: JSON.stringify({ id: token }),
    })
    if (res.status === 404) return { status: 'expired' }
    if (!res.ok) return { status: 'error' }
    const { html, expires_at } = (await res.json()) as { html: string; expires_at: string }
    return { status: 'ok', html, expiresAt: expires_at }
  } catch {
    return { status: 'error' }
  }
}
