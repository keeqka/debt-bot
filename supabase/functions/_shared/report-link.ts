// Одноразово-временные ссылки на «Выписку»: токен в адресе мини-аппа
// (/report/<токен>), html лежит в report_links до истечения срока.

import { env } from './env.ts'

export const REPORT_LINK_TTL_SECONDS = 300
export const REPORT_TOKEN_RE = /^[A-Za-z0-9_-]{32}$/

// deno-lint-ignore no-explicit-any
type SupabaseLike = any

function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_')
}

/** Сохраняет снимок и отдаёт публичный адрес. Просроченные ссылки заодно удаляются. */
export async function createReportLink(admin: SupabaseLike, householdId: string, html: string): Promise<{ url: string; expiresAt: string }> {
  await admin.from('report_links').delete().lt('expires_at', new Date().toISOString())
  const id = newToken()
  const expiresAt = new Date(Date.now() + REPORT_LINK_TTL_SECONDS * 1000).toISOString()
  const { error } = await admin.from('report_links').insert({ id, household_id: householdId, html, expires_at: expiresAt })
  if (error) throw error
  return { url: `${env.miniAppUrl}/report/${id}`, expiresAt }
}

/** html по токену, пока ссылка жива; иначе null (просроченная строка удаляется). */
export async function readReportLink(admin: SupabaseLike, id: string): Promise<{ html: string; expiresAt: string } | null> {
  if (!REPORT_TOKEN_RE.test(id)) return null
  const { data } = await admin.from('report_links').select('html, expires_at').eq('id', id).maybeSingle()
  if (!data) return null
  if (new Date(data.expires_at).getTime() <= Date.now()) {
    await admin.from('report_links').delete().eq('id', id)
    return null
  }
  return { html: data.html as string, expiresAt: data.expires_at as string }
}
