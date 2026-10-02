// Публичная «Выписка» по токену, без входа — доступ даёт сам токен, пока ссылка
// жива (5 минут), потом 404. POST {id} → { html } для страницы /report/<токен>;
// GET ?id=…&download=1 → файл .html вложением (ссылка «Скачать»).
// verify_jwt = false в config.toml — функция без сессии.

import { corsHeaders, handleOptions, jsonResponse, jsonError } from '../_shared/cors.ts'
import { getAdminClient } from '../_shared/supabase-admin.ts'
import { readReportLink } from '../_shared/report-link.ts'

Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  try {
    if (req.method === 'GET') {
      const id = new URL(req.url).searchParams.get('id') ?? ''
      const report = await readReportLink(getAdminClient(), id)
      if (!report) return new Response('Ссылка устарела — она живёт 5 минут. Попроси новую в Hlow Flow.', { status: 404, headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' } })
      // Не text/html: платформа переписывает html-ответы функций в text/plain, а нужно именно скачать файл.
      return new Response(report.html, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="hlow-flow-vypiska-${new Date().toISOString().slice(0, 10)}.html"`,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      })
    }

    const { id } = await req.json().catch(() => ({ id: '' }))
    const report = await readReportLink(getAdminClient(), String(id ?? ''))
    if (!report) return jsonResponse({ error: 'expired' }, 404)
    return jsonResponse({ html: report.html, expires_at: report.expiresAt })
  } catch (error) {
    return jsonError('Не удалось открыть выписку', error)
  }
})
