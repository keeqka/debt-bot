// ТЗ §8: receives Telegram bot updates.
//
// Two jobs:
//  1. `/start` — Telegram only allows a bot to message a user proactively
//     (weekly/monthly summaries, ТЗ §9) after they've started it once.
//  2. Photo/PDF sent straight to the bot chat (not through the Mini App) —
//     parsed the same way as the in-app receipt flow, then offered back as
//     an inline-keyboard confirmation (✅/❌) before anything is saved. The
//     draft lives in pending_expense_drafts between those two messages
//     because Telegram's callback_data is capped at 64 bytes — nowhere near
//     enough to carry a parsed receipt, so only its id travels in the button.

import { jsonResponse } from '../_shared/cors.ts'
import { env } from '../_shared/env.ts'
import { getAdminClient } from '../_shared/supabase-admin.ts'
import { getOrCreateUser } from '../_shared/get-or-create-user.ts'
import { downloadTelegramFile } from '../_shared/telegram-file.ts'
import { parseReceiptFile } from '../_shared/receipt-tool.ts'

// deno-lint-ignore no-explicit-any
type AnyRecord = Record<string, any>

const TG_API = (method: string) => `https://api.telegram.org/bot${env.telegramBotToken}/${method}`

async function sendTelegramMessage(chatId: number, text: string, replyMarkup?: unknown) {
  await fetch(TG_API('sendMessage'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown', reply_markup: replyMarkup }),
  })
}

async function editMessageText(chatId: number, messageId: number, text: string) {
  await fetch(TG_API('editMessageText'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, parse_mode: 'Markdown' }),
  })
}

async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  await fetch(TG_API('answerCallbackQuery'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
  })
}

async function handleReceiptMessage(message: AnyRecord) {
  const fromId = message.from.id
  const chatId = message.chat.id

  if (!env.allowedTelegramIds.includes(fromId)) {
    await sendTelegramMessage(chatId, 'Это приложение настроено для конкретных пользователей.')
    return
  }

  let fileId: string | null = null
  let fallbackMime = 'image/jpeg'

  if (message.photo) {
    fileId = message.photo[message.photo.length - 1].file_id // largest size is last
  } else if (message.document) {
    const mime: string = message.document.mime_type ?? ''
    if (mime === 'application/pdf' || mime.startsWith('image/')) {
      fileId = message.document.file_id
      fallbackMime = mime
    } else {
      await sendTelegramMessage(chatId, 'Пришлите фото чека или PDF — этот тип файла не поддерживается.')
      return
    }
  }
  if (!fileId) return

  await sendTelegramMessage(chatId, '🔍 Разбираю чек...')

  const admin = getAdminClient()
  const user = await getOrCreateUser(admin, message.from)

  const { data: categoriesData } = await admin.from('categories').select('id, name').eq('type', 'expense')
  const categories: AnyRecord[] = categoriesData ?? []

  const { data: fileBase64, mimeType } = await downloadTelegramFile(fileId, fallbackMime)
  const receipt = await parseReceiptFile(fileBase64, mimeType, categories.map((c) => c.name))

  if (!receipt.is_valid_receipt || !receipt.total_amount) {
    await sendTelegramMessage(chatId, 'Не похоже на чек — не нашёл сумму. Попробуйте другое фото или добавьте расход вручную в приложении.')
    return
  }

  const category = categories.find((c) => c.name === receipt.suggested_category)

  const draftPayload = {
    amount: receipt.total_amount,
    currency: receipt.currency ?? 'KZT',
    merchant: receipt.merchant,
    spent_at: receipt.date ?? new Date().toISOString().slice(0, 10),
    category_id: category?.id ?? null,
    category_name: category?.name ?? receipt.suggested_category ?? null,
    confidence: receipt.confidence,
  }

  const { data: draft, error } = await admin.from('pending_expense_drafts').insert({ user_id: user.id, payload: draftPayload }).select().single()
  if (error) throw error

  const lines = [
    `🧾 *${draftPayload.merchant ?? 'Расход'}*`,
    `Сумма: ${draftPayload.amount} ${draftPayload.currency}`,
    `Дата: ${draftPayload.spent_at}`,
    `Категория: ${draftPayload.category_name ?? 'не определена'}`,
  ]
  if (receipt.confidence < 0.6) lines.push('_Низкая уверенность распознавания — проверьте перед подтверждением._')

  await sendTelegramMessage(chatId, lines.join('\n'), {
    inline_keyboard: [
      [
        { text: '✅ Добавить', callback_data: `confirm_expense:${draft.id}` },
        { text: '❌ Отмена', callback_data: `cancel_expense:${draft.id}` },
      ],
    ],
  })
}

async function handleCallbackQuery(callbackQuery: AnyRecord) {
  const fromId = callbackQuery.from.id
  const chatId = callbackQuery.message.chat.id
  const messageId = callbackQuery.message.message_id
  const data: string = callbackQuery.data ?? ''

  if (!env.allowedTelegramIds.includes(fromId)) {
    await answerCallbackQuery(callbackQuery.id, 'Недоступно')
    return
  }

  if (data === 'disable_daily_reminder') {
    const admin = getAdminClient()
    await admin.from('users').update({ daily_reminder_enabled: false }).eq('telegram_id', fromId)
    await editMessageText(chatId, messageId, '🔕 Напоминания выключены — включить обратно можно в Профиле.')
    await answerCallbackQuery(callbackQuery.id, 'Выключено')
    return
  }

  const [action, draftId] = data.split(':')
  if (!draftId || (action !== 'confirm_expense' && action !== 'cancel_expense')) {
    await answerCallbackQuery(callbackQuery.id)
    return
  }

  const admin = getAdminClient()
  const { data: draft } = await admin.from('pending_expense_drafts').select('*').eq('id', draftId).maybeSingle()

  if (!draft) {
    await answerCallbackQuery(callbackQuery.id, 'Уже обработано')
    return
  }

  if (action === 'cancel_expense') {
    await admin.from('pending_expense_drafts').delete().eq('id', draftId)
    await editMessageText(chatId, messageId, '❌ Отменено.')
    await answerCallbackQuery(callbackQuery.id)
    return
  }

  const payload = draft.payload
  const { error } = await admin.from('expenses').insert({
    user_id: draft.user_id,
    amount: payload.amount,
    currency: payload.currency,
    category_id: payload.category_id,
    merchant: payload.merchant,
    spent_at: payload.spent_at,
    description: null,
    source: 'receipt_photo',
    receipt_asset_path: null,
    ai_confidence: payload.confidence,
    is_confirmed: true,
  })

  await admin.from('pending_expense_drafts').delete().eq('id', draftId)

  if (error) {
    console.error('failed to insert expense from telegram', error)
    await editMessageText(chatId, messageId, '⚠️ Не удалось сохранить расход, попробуйте через приложение.')
    await answerCallbackQuery(callbackQuery.id)
    return
  }

  await editMessageText(chatId, messageId, `✅ Добавлено: ${payload.merchant ?? 'расход'} — ${payload.amount} ${payload.currency}`)
  await answerCallbackQuery(callbackQuery.id, 'Добавлено')
}

Deno.serve(async (req) => {
  // Telegram calls this directly (not from the browser) — verify the secret
  // token set via `setWebhook`'s `secret_token` param instead of CORS/JWT.
  const secretHeader = req.headers.get('X-Telegram-Bot-Api-Secret-Token')
  if (secretHeader !== env.cronSecret) {
    return new Response('Forbidden', { status: 403 })
  }

  try {
    const update = await req.json()

    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query)
      return jsonResponse({ ok: true })
    }

    const message = update.message
    if (!message) return jsonResponse({ ok: true })

    if (message.text === '/start') {
      const isAllowed = env.allowedTelegramIds.includes(message.from.id)
      await sendTelegramMessage(
        message.chat.id,
        isAllowed
          ? 'Привет! Открой Mini App из меню бота, чтобы посмотреть свои финансы. Еженедельные и ежемесячные сводки теперь будут приходить сюда.\n\nТакже можно прислать мне сюда прямо в чат фото или PDF чека — разберу и предложу добавить расход.'
          : 'Это приложение настроено для конкретных пользователей — обратитесь к тем, кто его подключал.',
      )
      return jsonResponse({ ok: true })
    }

    if (message.photo || message.document) {
      await handleReceiptMessage(message)
      return jsonResponse({ ok: true })
    }

    return jsonResponse({ ok: true })
  } catch (error) {
    console.error('telegram-webhook failed', error)
    return jsonResponse({ ok: false }, 200) // always 200 so Telegram doesn't retry-storm us
  }
})
