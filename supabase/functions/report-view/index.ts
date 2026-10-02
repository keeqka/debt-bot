// Публичная страница «Выписки» (/report/<токен> на хосте мини-аппа): без входа,
// доступ — по самому токену. Отдаёт html, пока ссылка жива (5 минут), потом 404.
// verify_jwt = false в config.toml — это единственная такая функция, где нет сессии.

import { handleOptions, jsonResponse, jsonError } from '../_shared/cors.ts'
import { getAdminClient } from '../_shared/supabase-admin.ts'
import { readReportLink } from '../_shared/report-link.ts'

Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  try {
    const { id } = await req.json().catch(() => ({ id: '' }))
    const report = await readReportLink(getAdminClient(), String(id ?? ''))
    if (!report) return jsonResponse({ error: 'expired' }, 404)
    return jsonResponse({ html: report.html, expires_at: report.expiresAt })
  } catch (error) {
    return jsonError('Не удалось открыть выписку', error)
  }
})
