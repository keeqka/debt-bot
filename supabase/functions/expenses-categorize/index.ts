// ТЗ §7.2: fast/cheap auto-categorization for manually entered expenses.
// Deliberately on the light model — this runs on every manual entry, so cost
// per call matters more than for the occasional strategy/status calls.

import { handleOptions, jsonResponse, jsonError } from '../_shared/cors.ts'
import { requireSession } from '../_shared/auth.ts'
import { callClaudeTool, CLAUDE_MODEL_LIGHT } from '../_shared/claude.ts'
import { getUserClient } from '../_shared/supabase-admin.ts'

const CATEGORIZE_TOOL = {
  name: 'categorize_expense',
  description: 'Best-matching category for an expense.',
  input_schema: {
    type: 'object',
    properties: {
      category_id: { type: ['string', 'null'], description: 'uuid from the provided category list, or null if unsure' },
      new_category_suggestion: { type: ['string', 'null'], description: 'a new category name if nothing fits well' },
      confidence: { type: 'number', description: '0 to 1' },
    },
    required: ['confidence'],
  },
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  try {
    await requireSession(req)
    const { description, merchant, amount } = await req.json()

    const supabase = getUserClient(req.headers.get('Authorization')!)
    const { data: categories } = await supabase.from('categories').select('id, name').eq('type', 'expense')
    const categoryList = (categories ?? []).map((c) => `${c.id}: ${c.name}`).join('\n')

    const result = await callClaudeTool({
      model: CLAUDE_MODEL_LIGHT,
      system: `Классифицируй расход по одной из категорий (укажи её id) или предложи новую, если ничего не подходит.\nКатегории:\n${categoryList}`,
      messages: [{ role: 'user', content: `Магазин/получатель: ${merchant ?? '—'}\nОписание: ${description ?? '—'}\nСумма: ${amount}` }],
      tool: CATEGORIZE_TOOL,
      maxTokens: 300,
    })

    return jsonResponse(result)
  } catch (error) {
    return jsonError('Не удалось определить категорию', error)
  }
})
