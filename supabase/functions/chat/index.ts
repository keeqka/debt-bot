// ТЗ §7.7: AI advisor chat. The financial snapshot is re-attached to every
// call (not "remembered" by the model across turns) so it never goes stale.
//
// Two client tools the model can reach for:
//  - model_purchase_impact — "могу ли я купить MacBook за X?" gets a computed
//    projection instead of a guess; the frontend renders it as a card.
//  - propose_debt — "запиши мне долг перед Kaspi на 350 000" gets turned into
//    a pre-filled "Новый долг" form for the user to review and save
//    themselves. The model NEVER writes to the database directly — same
//    confirm-before-save rule as receipts and the screenshot debt-assist.
// web_search is also available (server-side, no client handling needed) so
// the advisor isn't limited to what's in the database for general questions.

import { handleOptions, jsonResponse, jsonError } from '../_shared/cors.ts'
import { requireSession } from '../_shared/auth.ts'
import { callClaudeRaw, CLAUDE_MODEL_DEFAULT, WEB_SEARCH_TOOL, type ClaudeMessage } from '../_shared/claude.ts'
import { getUserClient } from '../_shared/supabase-admin.ts'
import { buildFinancialSnapshot, snapshotToPrompt, type FinancialSnapshot } from '../_shared/finance-context.ts'

const PURCHASE_IMPACT_TOOL = {
  name: 'model_purchase_impact',
  description: 'Projects how a hypothetical purchase would affect the household financial status and goals.',
  input_schema: {
    type: 'object',
    properties: {
      item_name: { type: 'string' },
      amount: { type: 'number' },
      payment_type: { type: 'string', enum: ['one_time', 'installments'] },
      installment_months: { type: 'number' },
    },
    required: ['item_name', 'amount', 'payment_type'],
  },
}

const PROPOSE_DEBT_TOOL = {
  name: 'propose_debt',
  description:
    'Propose creating a new debt from what the user described in chat. This never saves anything — the app shows the user an editable form with these values to confirm before it is actually added.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      creditor: { type: 'string' },
      principal_amount: { type: ['number', 'null'] },
      current_balance: { type: ['number', 'null'] },
      interest_rate: { type: ['number', 'null'] },
      minimum_payment: { type: ['number', 'null'] },
      due_day: { type: ['number', 'null'] },
      confirmation_text: { type: 'string', description: 'по-русски: короткая фраза с просьбой проверить и подтвердить в форме' },
    },
    required: ['title', 'creditor', 'confirmation_text'],
  },
}

const DATA_WIDGET_TOOL = {
  name: 'render_data_widget',
  description:
    'Renders a numeric breakdown (e.g. spending by category, income vs expense) as a data card on paper instead of writing percentages out in text. Use for "how much do I spend on X" / "break down Y" style questions.',
  input_schema: {
    type: 'object',
    properties: {
      caption: { type: 'string', description: 'по-русски, 1 короткое предложение перед виджетом' },
      rows: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            amount: { type: 'number' },
            pct: { type: 'number', description: '0-100, доля от суммы всех строк' },
          },
          required: ['name', 'amount', 'pct'],
        },
      },
    },
    required: ['rows'],
  },
}

const SUGGEST_FOLLOWUPS_TOOL = {
  name: 'suggest_followups',
  description: '2-3 короткие вопроса, которые пользователь мог бы задать следующими, исходя из твоего последнего ответа.',
  input_schema: {
    type: 'object',
    properties: {
      replies: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 3 },
    },
    required: ['replies'],
  },
}

const ALL_TOOLS = [PURCHASE_IMPACT_TOOL, PROPOSE_DEBT_TOOL, DATA_WIDGET_TOOL, SUGGEST_FOLLOWUPS_TOOL, WEB_SEARCH_TOOL]

function computePurchaseImpact(
  input: { item_name: string; amount: number; payment_type: 'one_time' | 'installments'; installment_months?: number },
  snapshot: FinancialSnapshot,
) {
  const monthlySurplus = snapshot.totalIncomeLast30d - snapshot.totalExpenseLast30d - snapshot.totalMinPayments
  const monthlyHit = input.payment_type === 'installments' ? input.amount / Math.max(1, input.installment_months ?? 12) : input.amount
  const newSurplus = monthlySurplus - (input.payment_type === 'one_time' ? 0 : monthlyHit)
  const bufferHit = input.payment_type === 'one_time' ? input.amount : 0

  const monthsToRecoverBuffer = bufferHit > 0 && monthlySurplus > 0 ? Math.ceil(bufferHit / monthlySurplus) : 0
  const newStatus = newSurplus < 0 ? 'orange' : newSurplus < monthlySurplus * 0.3 ? 'yellow' : 'light_green'

  return {
    new_status: newStatus,
    months_to_recover_buffer: monthsToRecoverBuffer,
    impact_on_goals: snapshot.goals.map((g) => ({ title: g.title, delayed: bufferHit > 0 })),
    verdict:
      newSurplus < 0
        ? `После этой покупки расходы превысят доходы примерно на ${Math.abs(Math.round(newSurplus))} ${snapshot.currency} в месяц — стоит отложить или растянуть на рассрочку.`
        : `Покупка выполнима: свободный остаток снизится с ${Math.round(monthlySurplus)} до ${Math.round(newSurplus)} ${snapshot.currency} в месяц.`,
  }
}

function findToolUse(blocks: Array<Record<string, unknown>>, name: string) {
  return blocks.find((b) => b.type === 'tool_use' && b.name === name) as { id: string; input: Record<string, unknown> } | undefined
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  try {
    const session = await requireSession(req)
    const { content } = await req.json()
    if (!content) return jsonResponse({ error: 'content is required' }, 400)

    const supabase = getUserClient(req.headers.get('Authorization')!)
    await supabase.from('chat_messages').insert({ user_id: session.sub, role: 'user', content })

    // Most recent 20 — order-by-ascending-with-limit would instead grab the
    // OLDEST 20 and, once the thread outgrows that, silently drop the
    // message we just inserted. The array is reversed back to chronological
    // order afterward since that's what the Messages API expects.
    const { data: historyDesc } = await supabase
      .from('chat_messages')
      .select('role, content')
      .order('created_at', { ascending: false })
      .limit(20)
    const history = (historyDesc ?? []).slice().reverse()

    const snapshot = await buildFinancialSnapshot(supabase)
    const system = `Ты — личный финансовый AI-консультант семьи из двух человек. Отвечай по-русски, кратко и по делу, опираясь на приведённые ниже реальные данные — не придумывай цифры о финансах пользователя.\n\nФорматирование: ответ рендерится в узком чат-пузыре в мессенджере, а не в документе. Можно использовать **жирный** для ключевых цифр/выводов и короткие списки (-), если пунктов несколько. НЕ используй заголовки (#, ##, ###) — в чат-пузыре они выглядят как сломанная вёрстка. Обычно 2-5 коротких абзацев/пунктов достаточно.\n\nТекущее финансовое состояние:\n${snapshotToPrompt(snapshot)}\n\nИнструменты:\n- Если пользователь спрашивает про влияние конкретной покупки на бюджет — используй model_purchase_impact вместо оценки на глаз.\n- Если пользователь просит добавить/записать/завести долг — используй propose_debt с лучшими известными полями (null, если что-то не названо). НИКОГДА не говори, что долг уже добавлен — он появится в форме на подтверждение.\n- Если вопрос про разбивку по цифрам ("сколько я трачу на X", "на что уходят деньги") — используй render_data_widget вместо того, чтобы перечислять проценты текстом.\n- После содержательного ответа обычно вызывай suggest_followups с 2-3 короткими вопросами, которые логично задать дальше.\n- Можешь использовать веб-поиск для общих вопросов не про личные финансы пользователя (например, типичные цены, курсы, общие советы) — если используешь, упомяни это в ответе.\n- Никогда не давай советов по инвестициям, доходности вложений или конкретным финансовым инструментам (акции, крипта, депозиты под определённый процент и т.п.) — вежливо объясни, что это не твоя область, и предложи то, чем ты реально можешь помочь (бюджет, долги, траты).\n- Ты сам (в чате) не умеешь принимать файлы и не можешь напрямую добавлять траты или доходы. Но в приложении на вкладке "Чеки" можно загрузить фото/PDF чека или PDF банковской выписки — ИИ разберёт и предложит на подтверждение, а прямо боту в Telegram можно просто прислать фото/PDF чека. Если пользователь просит добавить траты — направь его туда, а не отказывай без объяснения.`

    const messages: ClaudeMessage[] = history
      .filter((m: { role: string }) => m.role === 'user' || m.role === 'assistant')
      .map((m: { role: 'user' | 'assistant'; content: string }) => ({ role: m.role, content: m.content }))

    const first = await callClaudeRaw({ system, messages, tools: ALL_TOOLS })

    let finalText = ''
    let proposedDebt: Record<string, unknown> | null = null
    let dataWidget: unknown[] | null = null
    // Which response to scan for suggest_followups — the second (post-tool-result)
    // turn when one happened, otherwise the first. Claude can emit multiple
    // tool_use blocks in one turn (tool_choice is "auto", not forced), so
    // suggest_followups can ride along with propose_debt/render_data_widget
    // directly, but model_purchase_impact needs its own round trip first.
    let followupSource = first.content

    const purchaseToolUse = findToolUse(first.content, 'model_purchase_impact')
    const proposeDebtToolUse = findToolUse(first.content, 'propose_debt')
    const dataWidgetToolUse = findToolUse(first.content, 'render_data_widget')

    if (purchaseToolUse && first.stop_reason === 'tool_use') {
      const impact = computePurchaseImpact(purchaseToolUse.input as never, snapshot)

      const second = await callClaudeRaw({
        system,
        tools: ALL_TOOLS,
        messages: [
          ...messages,
          { role: 'assistant', content: first.content as never },
          { role: 'user', content: [{ type: 'tool_result', tool_use_id: purchaseToolUse.id, content: JSON.stringify(impact) } as never] },
        ],
      })
      finalText = (second.content.find((b) => b.type === 'text') as { text: string } | undefined)?.text ?? impact.verdict
      followupSource = second.content
    } else if (proposeDebtToolUse) {
      const { confirmation_text, ...draft } = proposeDebtToolUse.input as Record<string, unknown> & { confirmation_text: string }
      finalText = confirmation_text || 'Проверьте предложенные данные и подтвердите добавление долга в форме.'
      proposedDebt = draft
    } else if (dataWidgetToolUse) {
      const { caption, rows } = dataWidgetToolUse.input as { caption?: string; rows: unknown[] }
      finalText = caption || (first.content.find((b) => b.type === 'text') as { text: string } | undefined)?.text || ''
      dataWidget = rows
    } else {
      finalText = (first.content.find((b) => b.type === 'text') as { text: string } | undefined)?.text ?? ''
    }

    const followupsToolUse = findToolUse(followupSource, 'suggest_followups')
    const quickReplies = (followupsToolUse?.input as { replies?: string[] } | undefined)?.replies ?? null

    const { data: saved, error } = await supabase
      .from('chat_messages')
      .insert({
        user_id: session.sub,
        role: 'assistant',
        content: finalText,
        context_snapshot: snapshot,
        model: CLAUDE_MODEL_DEFAULT,
        proposed_debt: proposedDebt,
        data_widget: dataWidget,
        quick_replies: quickReplies,
      })
      .select()
      .single()
    if (error) throw error

    return jsonResponse(saved)
  } catch (error) {
    return jsonError('Не удалось получить ответ', error)
  }
})
