// ТЗ §7.1: receipt/screenshot → structured expense draft. Never writes to the
// database itself — the frontend always shows a confirmation screen first
// (ТЗ §13: recognition accuracy isn't guaranteed) and saves via a normal
// `expenses` insert only after the user confirms.

import { handleOptions, jsonResponse } from '../_shared/cors.ts'
import { requireSession } from '../_shared/auth.ts'
import { callClaudeTool } from '../_shared/claude.ts'
import { getUserClient } from '../_shared/supabase-admin.ts'

const RECEIPT_TOOL = {
  name: 'record_receipt',
  description: 'Structured data extracted from a photographed receipt or payment screenshot.',
  input_schema: {
    type: 'object',
    properties: {
      is_valid_receipt: { type: 'boolean', description: 'false if the image is not a receipt or payment confirmation' },
      merchant: { type: ['string', 'null'] },
      date: { type: ['string', 'null'], description: 'ISO 8601 date, e.g. 2026-09-10' },
      total_amount: { type: ['number', 'null'] },
      currency: { type: ['string', 'null'], description: '3-letter ISO code, e.g. KZT' },
      line_items: {
        type: 'array',
        items: {
          type: 'object',
          properties: { name: { type: 'string' }, amount: { type: 'number' } },
          required: ['name', 'amount'],
        },
      },
      suggested_category: { type: ['string', 'null'], description: 'One of the provided category names, or null' },
      confidence: { type: 'number', description: '0 to 1' },
    },
    required: ['is_valid_receipt', 'line_items', 'confidence'],
  },
}

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

    const result = await callClaudeTool({
      system: `Ты помогаешь разобрать чек или скриншот банковского перевода/платежа. Извлеки магазина/получателя, дату, сумму, валюту и предложи категорию строго из списка: ${categoryNames.join(', ')}. Если это не финансовый документ — верни is_valid_receipt=false. Не придумывай данные, которых нет на изображении.`,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type, data: image_base64 } },
            { type: 'text', text: 'Разбери этот чек.' },
          ],
        },
      ],
      tool: RECEIPT_TOOL,
    })

    console.log(`receipts-parse ok for user ${session.sub}`)
    return jsonResponse(result)
  } catch (error) {
    console.error('receipts-parse failed', error)
    return jsonResponse({ error: 'Не удалось распознать чек' }, 500)
  }
})
