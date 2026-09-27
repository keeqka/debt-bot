// ТЗ §8: receives Telegram bot updates.
//
// Jobs:
//  1. `/start` — Telegram only lets a bot message a user proactively after
//     they've started it once. With a payload `inv_<code>` (an invite link)
//     it answers with a button that opens the Mini App carrying the code, so
//     auth-telegram can redeem it. Without access and without a code — an
//     invite request goes to the admins.
//  2. `/invite` (admins: a new family) and `/partner` (any member: their
//     partner) — one-time invite links, same database rules as in the app
//     (0017_households_and_invites.sql).
//  3. Photo/PDF sent straight to the chat — parsed like the in-app receipt
//     flow, then offered back as an inline confirmation before anything is
//     saved. The draft lives in pending_expense_drafts between the two
//     messages because callback_data is capped at 64 bytes.
//
// This function uses the service-role client (RLS off), so every read and
// write below is scoped to the sender's household explicitly.

import { jsonResponse } from '../_shared/cors.ts'
import { env } from '../_shared/env.ts'
import { getAdminClient } from '../_shared/supabase-admin.ts'
import { findMember, inviteErrorCode, type AppUser } from '../_shared/get-or-create-user.ts'
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

let botUsername: string | null = null
async function getBotUsername() {
  if (!botUsername) {
    const res = await fetch(TG_API('getMe'))
    botUsername = (await res.json()).result?.username ?? null
  }
  return botUsername
}

async function inviteLink(code: string) {
  return `https://t.me/${await getBotUsername()}?start=inv_${code}`
}

function openAppButton(invite?: string) {
  const url = `${env.miniAppUrl}/${invite ? `?invite=${invite}` : ''}#/overview`
  return { inline_keyboard: [[{ text: 'Открыть Hlow Flow', web_app: { url } }]] }
}

const INVITE_ERRORS: Record<string, string> = {
  limit_reached: 'Мест пока нет — лимит людей в приложении исчерпан.',
  family_full: 'В семье уже двое — третьего добавить нельзя.',
  forbidden: 'Новые семьи приглашает только админ. Партнёра в свою семью — командой /partner.',
  not_member: 'Сначала нужно войти в приложение.',
}

async function sendInvite(chatId: number, user: AppUser, kind: 'household' | 'partner') {
  const admin = getAdminClient()
  const { data: code, error } = await admin.rpc('create_invite_for', { p_user: user.id, p_kind: kind })
  if (error) {
    const known = inviteErrorCode(error)
    await sendTelegramMessage(chatId, known ? INVITE_ERRORS[known] : 'Не получилось создать приглашение, попробуй позже.')
    if (!known) console.error('create_invite_for failed', error)
    return
  }
  const who = kind === 'partner' ? 'партнёра в твою семью' : 'новую семью'
  await sendTelegramMessage(
    chatId,
    `Ссылка-приглашение в ${who}. Одноразовая, действует 7 дней — перешли её человеку:\n\n${await inviteLink(code as string)}`,
  )
}

async function notifyAdminsAboutRequest(from: AnyRecord) {
  const admin = getAdminClient()
  const { data: admins } = await admin.from('users').select('telegram_id').eq('is_admin', true)
  const name = [from.first_name, from.last_name].filter(Boolean).join(' ') || 'Без имени'
  const handle = from.username ? ` (@${from.username})` : ''
  for (const a of admins ?? []) {
    await sendTelegramMessage(
      a.telegram_id,
      `${name}${handle} просит доступ к Hlow Flow. Чтобы пригласить — /invite, и перешли ссылку.`,
    )
  }
}

async function handleStart(message: AnyRecord, member: AppUser | null) {
  const chatId = message.chat.id
  const payload: string = (message.text ?? '').split(/\s+/)[1] ?? ''

  if (member) {
    await sendTelegramMessage(
      chatId,
      'Открой приложение кнопкой ниже. Сюда будут приходить сводки и напоминания.\n\nЧек можно прислать прямо в этот чат — разберу и предложу добавить расход.\n\nПригласить партнёра в семью — /partner.',
      openAppButton(),
    )
    return
  }

  if (payload.startsWith('inv_')) {
    await sendTelegramMessage(chatId, 'Тебя пригласили в Hlow Flow. Открой приложение — вход займёт секунду.', openAppButton(payload.slice(4)))
    return
  }

  await notifyAdminsAboutRequest(message.from)
  await sendTelegramMessage(
    chatId,
    'Hlow Flow пока работает по приглашениям. Заявку передал — ссылка придёт сюда от админа или от того, кто уже пользуется приложением.',
  )
}

async function handleReceiptMessage(message: AnyRecord, user: AppUser) {
  const chatId = message.chat.id

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
      await sendTelegramMessage(chatId, 'Пришли фото чека или PDF — этот тип файла не поддерживается.')
      return
    }
  }
  if (!fileId) return

  await sendTelegramMessage(chatId, 'Разбираю чек...')

  const admin = getAdminClient()
  // Системные категории общие, свои — у семьи.
  const { data: categoriesData } = await admin
    .from('categories')
    .select('id, name')
    .eq('type', 'expense')
    .or(`household_id.is.null,household_id.eq.${user.household_id}`)
  const categories: AnyRecord[] = categoriesData ?? []

  const { data: fileBase64, mimeType } = await downloadTelegramFile(fileId, fallbackMime)
  const receipt = await parseReceiptFile(fileBase64, mimeType, categories.map((c) => c.name))

  if (!receipt.is_valid_receipt || !receipt.total_amount) {
    await sendTelegramMessage(chatId, 'Не похоже на чек — не нашёл сумму. Попробуй другое фото или добавь расход вручную в приложении.')
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

  const { data: draft, error } = await admin
    .from('pending_expense_drafts')
    .insert({ user_id: user.id, household_id: user.household_id, payload: draftPayload })
    .select()
    .single()
  if (error) throw error

  const lines = [
    `*${draftPayload.merchant ?? 'Расход'}*`,
    `Сумма: ${draftPayload.amount} ${draftPayload.currency}`,
    `Дата: ${draftPayload.spent_at}`,
    `Категория: ${draftPayload.category_name ?? 'не определена'}`,
  ]
  if (receipt.confidence < 0.6) lines.push('_Низкая уверенность распознавания — проверь перед подтверждением._')

  await sendTelegramMessage(chatId, lines.join('\n'), {
    inline_keyboard: [
      [
        { text: 'Добавить', callback_data: `confirm_expense:${draft.id}` },
        { text: 'Отмена', callback_data: `cancel_expense:${draft.id}` },
      ],
    ],
  })
}

async function handleCallbackQuery(callbackQuery: AnyRecord) {
  const chatId = callbackQuery.message.chat.id
  const messageId = callbackQuery.message.message_id
  const data: string = callbackQuery.data ?? ''

  const admin = getAdminClient()
  const user = await findMember(admin, callbackQuery.from)
  if (!user) {
    await answerCallbackQuery(callbackQuery.id, 'Недоступно')
    return
  }

  if (data === 'disable_daily_reminder') {
    await admin.from('users').update({ daily_reminder_enabled: false }).eq('id', user.id)
    await editMessageText(chatId, messageId, 'Напоминания выключены. Включить обратно можно в приложении, в настройках на «Обзоре».')
    await answerCallbackQuery(callbackQuery.id, 'Выключено')
    return
  }

  const [action, draftId] = data.split(':')
  if (!draftId || (action !== 'confirm_expense' && action !== 'cancel_expense')) {
    await answerCallbackQuery(callbackQuery.id)
    return
  }

  const { data: draft } = await admin
    .from('pending_expense_drafts')
    .select('*')
    .eq('id', draftId)
    .eq('household_id', user.household_id)
    .maybeSingle()

  if (!draft) {
    await answerCallbackQuery(callbackQuery.id, 'Уже обработано')
    return
  }

  if (action === 'cancel_expense') {
    await admin.from('pending_expense_drafts').delete().eq('id', draftId)
    await editMessageText(chatId, messageId, 'Отменено.')
    await answerCallbackQuery(callbackQuery.id)
    return
  }

  const payload = draft.payload
  const { error } = await admin.from('expenses').insert({
    user_id: draft.user_id,
    household_id: draft.household_id,
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
    await editMessageText(chatId, messageId, 'Не удалось сохранить расход — попробуй через приложение.')
    await answerCallbackQuery(callbackQuery.id)
    return
  }

  await editMessageText(chatId, messageId, `Добавлено: ${payload.merchant ?? 'расход'} — ${payload.amount} ${payload.currency}`)
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
    if (!message?.from) return jsonResponse({ ok: true })

    const member = await findMember(getAdminClient(), message.from)
    const text: string = message.text ?? ''
    const command = text.startsWith('/') ? text.split(/[\s@]/)[0] : ''

    if (command === '/start') {
      await handleStart(message, member)
      return jsonResponse({ ok: true })
    }

    if (!member) {
      await sendTelegramMessage(
        message.chat.id,
        'Hlow Flow пока работает по приглашениям. Если ссылки нет — нажми /start, и заявка уйдёт админу.',
      )
      return jsonResponse({ ok: true })
    }

    if (command === '/invite') {
      await sendInvite(message.chat.id, member, member.is_admin ? 'household' : 'partner')
      return jsonResponse({ ok: true })
    }

    if (command === '/partner') {
      await sendInvite(message.chat.id, member, 'partner')
      return jsonResponse({ ok: true })
    }

    if (message.photo || message.document) {
      await handleReceiptMessage(message, member)
      return jsonResponse({ ok: true })
    }

    return jsonResponse({ ok: true })
  } catch (error) {
    console.error('telegram-webhook failed', error)
    return jsonResponse({ ok: false }, 200) // always 200 so Telegram doesn't retry-storm us
  }
})
