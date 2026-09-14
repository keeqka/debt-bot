// AI-assisted "new debt" form fill — manually triggered from the UI only
// (never runs automatically). Takes a screenshot of a loan/credit and/or a
// text hint, extracts what it can see, and uses Anthropic's hosted web_search
// tool for anything not visible in the image (typically the interest rate),
// clearly flagging when it did so. The frontend always shows the result in
// the editable form for the user to review before saving — same "never
// trust AI blindly" pattern as receipts-parse (ТЗ §7.1/§13).

import { handleOptions, jsonResponse, jsonError } from '../_shared/cors.ts'
import { requireSession } from '../_shared/auth.ts'
import { callClaudeRaw, WEB_SEARCH_TOOL, type ContentBlock, type ToolDefinition } from '../_shared/claude.ts'

const DEBT_DRAFT_TOOL: ToolDefinition = {
  name: 'record_debt_draft',
  description: 'Best-effort structured draft of a debt/loan, extracted from a screenshot and/or web research. Always call this last.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'короткое название, напр. "Потребительский кредит"' },
      creditor: { type: 'string' },
      principal_amount: { type: ['number', 'null'] },
      current_balance: { type: ['number', 'null'] },
      currency: { type: 'string', description: '3-letter ISO code, обычно KZT' },
      interest_rate: { type: ['number', 'null'] },
      minimum_payment: { type: ['number', 'null'] },
      due_day: { type: ['number', 'null'] },
      used_web_search: { type: 'boolean', description: 'true если хоть одно поле взято из веб-поиска, а не со скриншота' },
      source_note: {
        type: 'string',
        description: 'по-русски: что откуда взято и что пользователю стоит перепроверить перед сохранением',
      },
      confidence: { type: 'number', description: '0 to 1, общая уверенность в данных' },
    },
    required: ['title', 'creditor', 'currency', 'used_web_search', 'source_note', 'confidence'],
  },
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  try {
    await requireSession(req)
    const { image_base64, media_type = 'image/jpeg', text_hint } = await req.json()
    if (!image_base64 && !text_hint) {
      return jsonResponse({ error: 'image_base64 or text_hint is required' }, 400)
    }

    const content: ContentBlock[] = []
    if (image_base64) content.push({ type: 'image', source: { type: 'base64', media_type, data: image_base64 } })
    content.push({
      type: 'text',
      text: text_hint ? `Дополнительно от пользователя: ${text_hint}` : 'Извлеки данные об этом кредите/долге со скриншота.',
    })

    const response = await callClaudeRaw({
      system:
        'Ты помогаешь человеку быстро завести долг в приложении учёта личных финансов. Извлеки со скриншота название, банк/кредитора, сумму, остаток, ставку, минимальный платёж и день платежа. Если какого-то значения не видно на скриншоте — особенно процентной ставки — используй web_search, чтобы найти актуальную типичную ставку этого банка по этому продукту, и явно укажи в source_note, что это оценка из интернета, а не со скриншота, и попроси пользователя перепроверить перед сохранением. Никогда не выдумывай цифры молча — если не удалось определить значение ни со скриншота, ни поиском, верни null. В конце твоего ответа ОБЯЗАТЕЛЬНО вызови record_debt_draft с лучшими найденными значениями.',
      messages: [{ role: 'user', content }],
      tools: [WEB_SEARCH_TOOL, DEBT_DRAFT_TOOL],
      maxTokens: 1500,
    })

    const draftBlock = response.content.find((b) => b.type === 'tool_use' && b.name === 'record_debt_draft') as
      | { input: Record<string, unknown> }
      | undefined
    if (!draftBlock) throw new Error('Model did not return record_debt_draft')

    return jsonResponse(draftBlock.input)
  } catch (error) {
    return jsonError('Не удалось разобрать данные о долге', error)
  }
})
