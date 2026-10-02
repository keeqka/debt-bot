// «Выписка» — HTML-чек с итогами прошлого и текущего месяца, тем, что поправить,
// долгами и целями (_shared/report.ts). Мини-апп показывает html в sandbox-iframe;
// { link: true } вместо этого делает временную (5 минут) ссылку /report/<токен>
// на хосте мини-аппа — её можно открыть без входа и переслать партнёру.

import { handleOptions, jsonResponse, jsonError } from '../_shared/cors.ts'
import { requireSession } from '../_shared/auth.ts'
import { getAdminClient, getUserClient } from '../_shared/supabase-admin.ts'
import { buildReportHtml } from '../_shared/report.ts'
import { createReportLink, REPORT_LINK_TTL_SECONDS } from '../_shared/report-link.ts'

Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  try {
    const session = await requireSession(req)
    const { link } = await req.json().catch(() => ({ link: false }))
    const supabase = getUserClient(req.headers.get('Authorization')!)
    const html = await buildReportHtml(supabase)

    if (link) {
      const { url, downloadUrl, expiresAt } = await createReportLink(getAdminClient(), session.household_id, html)
      return jsonResponse({ url, download_url: downloadUrl, expires_at: expiresAt, expires_in: REPORT_LINK_TTL_SECONDS })
    }
    return jsonResponse({ html })
  } catch (error) {
    return jsonError('Не удалось собрать выписку', error)
  }
})
