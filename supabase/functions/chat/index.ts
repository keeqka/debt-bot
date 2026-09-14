// ТЗ §7.7: AI advisor chat. The financial snapshot is re-attached to every
// call (not "remembered" by the model across turns) so it never goes stale.
// Purchase-impact questions ("могу ли я купить MacBook за X?") go through the
// model_purchase_impact tool so the answer is a computed projection, not a
// guess — the frontend renders its result as a dedicated card (ТЗ §5 screen 5).

import { handleOptions, jsonResponse, jsonError } from '../_shared/cors.ts'
import { requireSession } from '../_shared/auth.ts'
import { callClaudeRaw, type ClaudeMessage } from '../_shared/claude.ts'
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
        ? `После этой покупки расходы превысят доходы примерно на ${Math.abs(Math.round(newSurplus))} в месяц — стоит отложить или растянуть на рассрочку.`
        : `Покупка выполнима: свободный остаток снизится с ${Math.round(monthlySurplus)} до ${Math.round(newSurplus)} в месяц.`,
  }
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

    const { data: history } = await supabase
      .from('chat_messages')
      .select('role, content')
      .order('created_at', { ascending: true })
      .limit(20)

    const snapshot = await buildFinancialSnapshot(supabase)
    const system = `Ты — личный финансовый AI-консультант семьи из двух человек. Отвечай по-русски, кратко и по делу, опираясь ТОЛЬКО на приведённые ниже реальные данные — не придумывай цифры.\n\nТекущее финансовое состояние:\n${snapshotToPrompt(snapshot)}\n\nЕсли пользователь спрашивает про влияние конкретной покупки на бюджет — используй инструмент model_purchase_impact вместо оценки на глаз.`

    const messages: ClaudeMessage[] = (history ?? [])
      .filter((m: { role: string }) => m.role === 'user' || m.role === 'assistant')
      .map((m: { role: 'user' | 'assistant'; content: string }) => ({ role: m.role, content: m.content }))

    const first = await callClaudeRaw({ system, messages, tools: [PURCHASE_IMPACT_TOOL] })

    let finalText = ''
    const toolUse = first.content.find((b) => b.type === 'tool_use') as
      | { id: string; name: string; input: Record<string, unknown> }
      | undefined

    if (toolUse && first.stop_reason === 'tool_use') {
      const impact = computePurchaseImpact(toolUse.input as never, snapshot)

      const second = await callClaudeRaw({
        system,
        tools: [PURCHASE_IMPACT_TOOL],
        messages: [
          ...messages,
          { role: 'assistant', content: first.content as never },
          { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify(impact) } as never] },
        ],
      })
      finalText = (second.content.find((b) => b.type === 'text') as { text: string } | undefined)?.text ?? impact.verdict
    } else {
      finalText = (first.content.find((b) => b.type === 'text') as { text: string } | undefined)?.text ?? ''
    }

    const { data: saved, error } = await supabase
      .from('chat_messages')
      .insert({ user_id: session.sub, role: 'assistant', content: finalText, context_snapshot: snapshot })
      .select()
      .single()
    if (error) throw error

    return jsonResponse(saved)
  } catch (error) {
    return jsonError('Не удалось получить ответ', error)
  }
})
