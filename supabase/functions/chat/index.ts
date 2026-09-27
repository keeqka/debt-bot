// ТЗ §7.7: AI advisor chat. The financial snapshot is re-attached to every
// call (not "remembered" by the model across turns) so it never goes stale.
//
// Client tools the model can reach for — this is what makes it an assistant
// for the whole app, not just a Q&A box:
//  - model_purchase_impact — "могу ли я купить MacBook за X?" gets a computed
//    projection instead of a guess; the frontend renders it as a card.
//  - propose_debt — "запиши мне долг перед Kaspi на 350 000" gets turned into
//    a pre-filled "Новый долг" form for the user to review and save
//    themselves. The model NEVER writes to the database directly — same
//    confirm-before-save rule as receipts and the screenshot debt-assist.
//  - propose_category — "добавь категорию Подписки" gets a one-tap confirm
//    card (no form: unlike a debt there's nothing here worth reviewing).
// web_search is also available (server-side, no client handling needed) so
// the advisor isn't limited to what's in the database for general questions.

import { handleOptions, jsonResponse, jsonError } from '../_shared/cors.ts'
import { requireSession } from '../_shared/auth.ts'
import { callClaudeRaw, CLAUDE_MODEL_DEFAULT, WEB_SEARCH_TOOL, type ClaudeMessage } from '../_shared/claude.ts'
import { getUserClient } from '../_shared/supabase-admin.ts'
import { avalancheOrder, buildFinancialSnapshot, snapshotToPrompt, type FinancialSnapshot } from '../_shared/finance-context.ts'
import { simulateDebtPayoff } from '../_shared/debt-simulation.ts'
import { PERSONA } from '../_shared/persona.ts'

const PURCHASE_IMPACT_TOOL = {
  name: 'model_purchase_impact',
  description: 'Checks a hypothetical purchase against this month\'s budget and the debt payoff plan (debts come first) — returns whether it fits and how far the debt-free date would move.',
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

const PROPOSE_CATEGORY_TOOL = {
  name: 'propose_category',
  description:
    'Propose creating a new expense/income category the user asked for in chat ("добавь категорию Подписки"). Shown as a one-tap confirm in the bubble — nothing is created until the user taps it.',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      type: { type: 'string', enum: ['expense', 'income'] },
      confirmation_text: { type: 'string', description: 'по-русски: короткая фраза с предложением добавить эту категорию' },
    },
    required: ['name', 'type', 'confirmation_text'],
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

const ALL_TOOLS = [PURCHASE_IMPACT_TOOL, PROPOSE_DEBT_TOOL, PROPOSE_CATEGORY_TOOL, DATA_WIDGET_TOOL, SUGGEST_FOLLOWUPS_TOOL, WEB_SEARCH_TOOL]

function monthsBetween(fromIso: string, toIso: string) {
  const a = new Date(fromIso)
  const b = new Date(toIso)
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
}

/**
 * "Могу ли я купить X" against the same budget the app shows (_shared/budget.ts):
 * a one-off purchase first has to fit this month's spending money; whatever
 * doesn't comes out of the money earmarked for debts (debts come first), so the
 * honest consequence is how far the debt-free date moves. Installments eat into
 * that monthly extra for their whole term — computed with the real simulation.
 */
function computePurchaseImpact(
  input: { item_name: string; amount: number; payment_type: 'one_time' | 'installments'; installment_months?: number },
  snapshot: FinancialSnapshot,
) {
  const b = snapshot.budget
  const cur = snapshot.currency
  const r = (n: number) => Math.round(n)
  const free = Math.max(0, b.available)
  const base = { available_this_month: r(b.available), plan_extra_per_month: r(b.planExtra), plan_target: b.planTarget, debt_free_date: snapshot.debtFreeDate }

  if (input.payment_type === 'installments') {
    const months = Math.max(1, input.installment_months ?? 12)
    const monthly = input.amount / months
    let newDebtFreeDate: string | null = snapshot.debtFreeDate
    if (b.planTarget === 'debts' && snapshot.debts.length) {
      newDebtFreeDate = simulateDebtPayoff(avalancheOrder(snapshot.debts), Math.max(0, b.planExtra - monthly)).estimatedPayoffDate
    }
    const delay = snapshot.debtFreeDate && newDebtFreeDate ? monthsBetween(snapshot.debtFreeDate, newDebtFreeDate) : null
    return {
      ...base,
      monthly_payment: r(monthly),
      new_debt_free_date: newDebtFreeDate,
      debt_payoff_delay_months: delay,
      verdict:
        monthly > b.planExtra
          ? `Платёж ${r(monthly)} ${cur} в месяц больше, чем остаётся сверх обычных трат и минимальных платежей (${r(b.planExtra)}) — рассрочка уйдёт в минус.`
          : b.planTarget === 'debts'
            ? `Рассрочка заберёт ${r(monthly)} из ${r(b.planExtra)} ${cur} в месяц, которые сейчас идут в долги${delay ? ` — закрытие долгов сдвинется на ${delay} мес.` : '.'}`
            : `Влезает: ${r(monthly)} из ${r(b.planExtra)} ${cur} свободных в месяц.`,
    }
  }

  if (input.amount <= free) {
    const left = b.available - input.amount
    return {
      ...base,
      fits_this_month: true,
      available_after: r(left),
      per_day_after: b.daysLeft > 0 ? Math.floor(left / b.daysLeft / 10) * 10 : r(left),
      verdict: `Влезает в бюджет месяца: свободно ${r(b.available)} ${cur}, после покупки останется ${r(left)}.`,
    }
  }

  const shortfall = input.amount - free
  const monthsOfPlan = b.planExtra > 0 ? Math.ceil(shortfall / b.planExtra) : null
  return {
    ...base,
    fits_this_month: false,
    shortfall: r(shortfall),
    months_of_plan_extra: monthsOfPlan,
    verdict:
      monthsOfPlan == null
        ? `В бюджет месяца не влезает (свободно ${r(free)} ${cur}), а сверх обычных трат и минимальных платежей ничего не остаётся — покупка уйдёт в минус.`
        : b.planTarget === 'debts'
          ? `В бюджет месяца не влезает: свободно ${r(free)} ${cur}. Недостающие ${r(shortfall)} придётся взять из денег на долги — закрытие сдвинется примерно на ${monthsOfPlan} мес.`
          : `В бюджет месяца не влезает: свободно ${r(free)} ${cur}. Недостающие ${r(shortfall)} наберутся за ${monthsOfPlan} мес. свободных денег.`,
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
    const categoryNames = snapshot.categoryNames.join(', ') || '—'
    const system = `${PERSONA}\n\nФорматирование: ответ рендерится в узком чат-пузыре в мессенджере, а не в документе. Можно **жирный** для ключевых цифр и короткие списки (-), если пунктов несколько. НЕ используй заголовки (#, ##, ###) — в пузыре они выглядят как сломанная вёрстка. Два-три коротких абзаца — норма.\n\nТекущее финансовое состояние:\n${snapshotToPrompt(snapshot)}\n\nТы — помощник по всему приложению, не только по разговору: можешь предлагать реальные действия (добавить долг, завести категорию), а не только отвечать текстом.\n\nИнструменты:\n- Влияние конкретной покупки на бюджет — model_purchase_impact, а не оценка на глаз. Главное последствие — насколько сдвинется закрытие долгов.\n- Спрашивают, где перерасход, на что ушло больше обычного, нет ли странных трат — опирайся на блок «Перерасход и аномалии» и «обычно за месяц» по категориям; разбивку показывай через render_data_widget.\n- Просят добавить/записать/завести долг — propose_debt с лучшими известными полями (null, если что-то не названо). НИКОГДА не говори, что долг уже добавлен — он появится в форме на подтверждение.\n- Просят добавить/завести категорию расходов или доходов — propose_category. Уже существующие категории: ${categoryNames} — не предлагай дубликат, если похожая уже есть, скажи об этом вместо предложения. НИКОГДА не говори, что категория уже добавлена — она появится с кнопкой подтверждения.\n- Вопрос про разбивку по цифрам ("сколько я трачу на X", "на что уходят деньги") — render_data_widget, а не перечисление процентов текстом.\n- После содержательного ответа обычно вызывай suggest_followups с 2-3 короткими вопросами.\n- Веб-поиск — только для общих вопросов не про личные финансы пользователя (типичные цены, курсы). Если использовал — скажи об этом одной фразой.\n- Ты сам не принимаешь файлы и не добавляешь траты напрямую. Фото/PDF чека и PDF выписки грузятся на вкладке "Чеки", а боту в Telegram чек можно просто прислать. Если просят добавить траты — направь туда.`

    const messages: ClaudeMessage[] = history
      .filter((m: { role: string }) => m.role === 'user' || m.role === 'assistant')
      .map((m: { role: 'user' | 'assistant'; content: string }) => ({ role: m.role, content: m.content }))

    const first = await callClaudeRaw({ system, messages, tools: ALL_TOOLS })

    let finalText = ''
    let proposedDebt: Record<string, unknown> | null = null
    let proposedCategory: Record<string, unknown> | null = null
    let dataWidget: unknown[] | null = null
    // Which response to scan for suggest_followups — the second (post-tool-result)
    // turn when one happened, otherwise the first. Claude can emit multiple
    // tool_use blocks in one turn (tool_choice is "auto", not forced), so
    // suggest_followups can ride along with propose_debt/render_data_widget
    // directly, but model_purchase_impact needs its own round trip first.
    let followupSource = first.content

    const purchaseToolUse = findToolUse(first.content, 'model_purchase_impact')
    const proposeDebtToolUse = findToolUse(first.content, 'propose_debt')
    const proposeCategoryToolUse = findToolUse(first.content, 'propose_category')
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
    } else if (proposeCategoryToolUse) {
      const { confirmation_text, ...draft } = proposeCategoryToolUse.input as Record<string, unknown> & { confirmation_text: string }
      finalText = confirmation_text || 'Добавить такую категорию?'
      proposedCategory = draft
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
        proposed_category: proposedCategory,
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
