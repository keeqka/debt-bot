// «Выписка» — HTML-чек с итогами прошлого и текущего месяца, тем, что поправить,
// долгами и целями (_shared/report.ts). Мини-апп показывает html в sandbox-iframe;
// { send: true } вместо этого присылает файлом в Telegram-чат пользователя.

import { handleOptions, jsonResponse, jsonError } from '../_shared/cors.ts'
import { requireSession } from '../_shared/auth.ts'
import { getUserClient } from '../_shared/supabase-admin.ts'
import { buildReportHtml } from '../_shared/report.ts'
import { sendTelegramDocument } from '../_shared/telegram-send.ts'

Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  try {
    const session = await requireSession(req)
    const { send } = await req.json().catch(() => ({ send: false }))
    const supabase = getUserClient(req.headers.get('Authorization')!)
    const html = await buildReportHtml(supabase)

    if (send) {
      const stamp = new Date().toISOString().slice(0, 10)
      const ok = await sendTelegramDocument(session.telegram_id, `hlow-flow-vypiska-${stamp}.html`, html, 'Выписка Hlow Flow. Открой файл в браузере.')
      if (!ok) throw new Error('Telegram не принял файл')
      return jsonResponse({ ok: true })
    }
    return jsonResponse({ html })
  } catch (error) {
    return jsonError('Не удалось собрать выписку', error)
  }
})
