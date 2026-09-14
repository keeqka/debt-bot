// Bank statement import (multiple months' worth of receipt-parse in one go).
// Never writes to the database — the frontend always shows every extracted
// transaction on a review screen (checkbox + editable amount/category per
// row) before any bulk insert into expenses/incomes, per the same
// confirm-before-save rule as receipts-parse and debts-assist.

import { handleOptions, jsonResponse, jsonError } from '../_shared/cors.ts'
import { requireSession } from '../_shared/auth.ts'
import { getUserClient } from '../_shared/supabase-admin.ts'
import { parseStatementFile } from '../_shared/statement-tool.ts'
import { resolveBaseCurrency } from '../_shared/currency.ts'

Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  try {
    const session = await requireSession(req)
    const { file_base64, media_type = 'application/pdf' } = await req.json()
    if (!file_base64) return jsonResponse({ error: 'file_base64 is required' }, 400)

    const supabase = getUserClient(req.headers.get('Authorization')!)
    const [{ data: categories }, currency] = await Promise.all([
      supabase.from('categories').select('name').eq('type', 'expense'),
      resolveBaseCurrency(supabase),
    ])
    const categoryNames = (categories ?? []).map((c: { name: string }) => c.name)

    const result = await parseStatementFile(file_base64, media_type, categoryNames, currency)

    console.log(`statement-parse ok for user ${session.sub}: ${result.transactions.length} transactions`)
    return jsonResponse(result)
  } catch (error) {
    return jsonError('Не удалось разобрать выписку', error)
  }
})
