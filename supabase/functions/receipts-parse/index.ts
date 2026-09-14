// ТЗ §7.1: receipt/screenshot → structured expense draft. Never writes to the
// database itself — the frontend always shows a confirmation screen first
// (ТЗ §13: recognition accuracy isn't guaranteed) and saves via a normal
// `expenses` insert only after the user confirms.

import { handleOptions, jsonResponse, jsonError } from '../_shared/cors.ts'
import { requireSession } from '../_shared/auth.ts'
import { getUserClient } from '../_shared/supabase-admin.ts'
import { parseReceiptFile } from '../_shared/receipt-tool.ts'

Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  try {
    const session = await requireSession(req)
    const { image_base64, media_type = 'image/jpeg' } = await req.json()
    if (!image_base64) return jsonResponse({ error: 'image_base64 is required' }, 400)

    const supabase = getUserClient(req.headers.get('Authorization')!)
    const { data: categories } = await supabase.from('categories').select('name').eq('type', 'expense')
    const categoryNames = (categories ?? []).map((c) => c.name)

    const result = await parseReceiptFile(image_base64, media_type, categoryNames)

    console.log(`receipts-parse ok for user ${session.sub}`)
    return jsonResponse(result)
  } catch (error) {
    return jsonError('Не удалось распознать чек', error)
  }
})
