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
//  3. Stars payments: pre_checkout_query is confirmed (Telegram gives 10 s),
//     successful_payment is recorded (payments, subscriptions.paid_until) —
//     first charge and every monthly renewal alike. /paysupport forwards the
//     question to the admins (Telegram requires it for payments); admins can
//     refund with /refund <charge_id>.
//  4. Photo/PDF sent straight to the chat — parsed like the in-app receipt
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
import { findMerchantRule } from '../_shared/merchant.ts'
import { buildReportHtml } from '../_shared/report.ts'
import { createReportLink, REPORT_LINK_TTL_SECONDS } from '../_shared/report-link.ts'
import { decodePayload } from '../_shared/stars.ts'

// deno-lint-ignore no-explicit-any
type AnyRecord = Record<string, any>

const TG_API = (method: string) => `https://api.telegram.org/bot${env.telegramBotToken}/${method}`

// parse_mode 'Markdown' is Telegram's legacy mode: a single "_" or "*"
// toggles emphasis, so any text carrying unescaped user/generated content —
// a raw URL (our invite links are t.me/<username>_bot?start=inv_<code>, two
// underscores), a Telegram display name, an OCR'd receipt line — can come
// out corrupted (paired underscores are silently swallowed as italics: an
// invite link once rendered as t.me/…botbot?start=inv<code>, the codes
// missing, "Sorry, this user doesn't seem to exist") or refused outright
// (an odd count of "*"/"_" is invalid Markdown and Telegram 400s the whole
// send). Pass `plain: true` for any text built from such content — plain
// messages still auto-link bare URLs, so nothing is lost.
async function sendTelegramMessage(chatId: number, text: string, replyMarkup?: unknown, opts?: { plain?: boolean }) {
  await fetch(TG_API('sendMessage'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, ...(opts?.plain ? {} : { parse_mode: 'Markdown' }), reply_markup: replyMarkup }),
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

// Same username as the app's lib/bot.ts and the landing page — hardcoded
// rather than looked up via getMe() at request time: a live lookup is one
// more thing that can silently fail and produce a broken t.me/<empty>
// link (Telegram then shows "Sorry, this user doesn't seem to exist",
// with no error on our side to notice it by).
const BOT_USERNAME = 'aibasedfinancecontrolbot_bot'

function inviteLink(code: string) {
  return `https://t.me/${BOT_USERNAME}?start=inv_${code}`
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
    `Ссылка-приглашение в ${who}. Одноразовая, действует 7 дней — перешли её человеку:\n\n${inviteLink(code as string)}`,
    undefined,
    { plain: true },
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
      undefined,
      { plain: true },
    )
  }
}

async function callTelegram(method: string, body: unknown) {
  const res = await fetch(TG_API(method), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

async function handlePreCheckout(query: AnyRecord) {
  const payload = decodePayload(query.invoice_payload ?? '')
  const admin = getAdminClient()
  const { data: household } = payload
    ? await admin.from('households').select('id').eq('id', payload.householdId).maybeSingle()
    : { data: null }
  await callTelegram(
    'answerPreCheckoutQuery',
    household
      ? { pre_checkout_query_id: query.id, ok: true }
      : { pre_checkout_query_id: query.id, ok: false, error_message: 'Не нашёл твою семью в Hlow Flow — открой приложение и попробуй снова.' },
  )
}

function formatDay(d: Date) {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(d)
}

async function handleSuccessfulPayment(message: AnyRecord) {
  const pay = message.successful_payment
  const payload = decodePayload(pay.invoice_payload ?? '')
  if (!payload) {
    console.error('successful_payment with unknown payload', pay.invoice_payload)
    return
  }
  const admin = getAdminClient()
  const expires = pay.subscription_expiration_date ? new Date(pay.subscription_expiration_date * 1000) : null
  const { data: payer } = await admin.from('users').select('id').eq('telegram_id', message.from.id).maybeSingle()

  const { error } = await admin.from('payments').insert({
    household_id: payload.householdId,
    user_id: payer?.id ?? payload.userId,
    telegram_payment_charge_id: pay.telegram_payment_charge_id,
    amount_stars: pay.total_amount,
    is_recurring: Boolean(pay.is_recurring),
    subscription_expires_at: expires?.toISOString() ?? null,
  })
  // Повторная доставка того же платежа — уже записан (unique charge id).
  if (error && !String(error.message).includes('duplicate')) throw error

  if (expires) {
    await admin
      .from('subscriptions')
      .update({ status: 'active', paid_until: expires.toISOString(), activated_at: new Date().toISOString() })
      .eq('household_id', payload.householdId)
  }

  await sendTelegramMessage(
    message.chat.id,
    pay.is_recurring && !pay.is_first_recurring
      ? `Подписка продлена${expires ? ` до ${formatDay(expires)}` : ''}. Спасибо, что поддерживаешь Hlow Flow.`
      : `Спасибо — поддержка оформлена${expires ? ` до ${formatDay(expires)}` : ''}. Продлевается сама раз в 30 дней, отменить можно в Telegram: Настройки → Мои звёзды.`,
  )
}

async function handlePaySupport(message: AnyRecord) {
  const admin = getAdminClient()
  const { data: admins } = await admin.from('users').select('telegram_id').eq('is_admin', true)
  const name = [message.from.first_name, message.from.last_name].filter(Boolean).join(' ') || 'Без имени'
  const handle = message.from.username ? ` (@${message.from.username})` : ''
  const question = (message.text ?? '').replace(/^\/paysupport\S*\s*/, '').trim()
  for (const a of admins ?? []) {
    await sendTelegramMessage(
      a.telegram_id,
      `Вопрос по оплате от ${name}${handle}: ${question || '(без текста)'}\nВернуть звёзды — /refund <charge_id> (id есть в таблице payments).`,
    )
  }
  await sendTelegramMessage(
    message.chat.id,
    'Передал вопрос по оплате админу — ответ придёт сюда. Если нужен возврат, напиши, за какой платёж и почему.',
  )
}

async function handleRefund(message: AnyRecord, member: AppUser) {
  if (!member.is_admin) {
    await sendTelegramMessage(message.chat.id, 'Возвраты делает только админ. Вопрос по оплате — /paysupport.')
    return
  }
  const chargeId = (message.text ?? '').split(/\s+/)[1]
  const admin = getAdminClient()
  const { data: payment } = chargeId
    ? await admin.from('payments').select('id, user_id, refunded_at').eq('telegram_payment_charge_id', chargeId).maybeSingle()
    : { data: null }
  if (!payment) {
    await sendTelegramMessage(message.chat.id, 'Не нашёл такой платёж. Формат: /refund <telegram_payment_charge_id>')
    return
  }
  if (payment.refunded_at) {
    await sendTelegramMessage(message.chat.id, 'Этот платёж уже возвращён.')
    return
  }
  const { data: payer } = await admin.from('users').select('telegram_id').eq('id', payment.user_id).maybeSingle()
  const result = await callTelegram('refundStarPayment', { user_id: payer?.telegram_id, telegram_payment_charge_id: chargeId })
  if (!result.ok) {
    await sendTelegramMessage(message.chat.id, `Telegram не принял возврат: ${result.description ?? 'неизвестная ошибка'}`)
    return
  }
  await admin.from('payments').update({ refunded_at: new Date().toISOString() }).eq('id', payment.id)
  await sendTelegramMessage(message.chat.id, 'Звёзды возвращены.')
}

async function handleStart(message: AnyRecord, member: AppUser | null) {
  const chatId = message.chat.id
  const payload: string = (message.text ?? '').split(/\s+/)[1] ?? ''

  if (member) {
    await sendTelegramMessage(
      chatId,
      'Открой приложение кнопкой ниже. Сюда будут приходить сводки и напоминания.\n\nЧек можно прислать прямо в этот чат — разберу и предложу добавить расход.\n\nВыписка за месяц — /report. Пригласить партнёра в семью — /partner.',
      openAppButton(),
    )
    return
  }

  if (payload.startsWith('inv_')) {
    const code = payload.slice(4)
    // Запоминаем код: приложение могут открыть не этой кнопкой, а меню бота —
    // тогда auth-telegram возьмёт приглашение отсюда (0018_pending_invites.sql).
    const { error } = await getAdminClient()
      .from('pending_invites')
      .upsert({ telegram_id: message.from.id, code, created_at: new Date().toISOString() })
    if (error) {
      // Код не существует (FK) — ссылка устарела или набрана с ошибкой.
      await sendTelegramMessage(chatId, 'Ссылка-приглашение не работает — возможно, она устарела. Попроси новую.')
      return
    }
    await sendTelegramMessage(chatId, 'Тебя пригласили в Hlow Flow. Открой приложение — вход займёт секунду.', openAppButton(code))
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

  // Правило магазина (семья уже правила категорию) сильнее догадки ИИ.
  const { data: rulesData } = await admin.from('merchant_rules').select('merchant_key, category_id').eq('household_id', user.household_id)
  const rule = findMerchantRule((rulesData ?? []) as Array<{ merchant_key: string; category_id: string }>, receipt.merchant)
  const category =
    categories.find((c) => c.id === rule?.category_id) ??
    categories.find((c) => String(c.name).trim().toLowerCase() === receipt.suggested_category?.trim().toLowerCase())

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
  // ИИ мог предложить новую категорию (её ещё нет) — создаётся здесь, при подтверждении.
  let categoryId: string | null = payload.category_id ?? null
  if (!categoryId && payload.category_name) {
    const wanted = String(payload.category_name).trim()
    const { data: existing } = await admin
      .from('categories')
      .select('id, name')
      .eq('type', 'expense')
      .or(`household_id.is.null,household_id.eq.${draft.household_id}`)
    categoryId = (existing ?? []).find((c: AnyRecord) => String(c.name).trim().toLowerCase() === wanted.toLowerCase())?.id ?? null
    if (!categoryId && wanted) {
      const { data: created } = await admin
        .from('categories')
        .insert({ name: wanted, icon: 'tag', type: 'expense', is_system: false, household_id: draft.household_id })
        .select('id')
        .single()
      categoryId = created?.id ?? null
    }
  }
  const { error } = await admin.from('expenses').insert({
    user_id: draft.user_id,
    household_id: draft.household_id,
    amount: payload.amount,
    currency: payload.currency,
    category_id: categoryId,
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

    if (update.pre_checkout_query) {
      await handlePreCheckout(update.pre_checkout_query)
      return jsonResponse({ ok: true })
    }

    const message = update.message
    if (!message?.from) return jsonResponse({ ok: true })

    if (message.successful_payment) {
      await handleSuccessfulPayment(message)
      return jsonResponse({ ok: true })
    }

    const member = await findMember(getAdminClient(), message.from)
    const text: string = message.text ?? ''
    const command = text.startsWith('/') ? text.split(/[\s@]/)[0] : ''

    if (command === '/paysupport') {
      await handlePaySupport(message)
      return jsonResponse({ ok: true })
    }

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

    if (command === '/report') {
      try {
        const admin = getAdminClient()
        const { url } = await createReportLink(admin, member.household_id, await buildReportHtml(admin, member.household_id))
        await sendTelegramMessage(
          message.chat.id,
          `Выписка готова. Ссылка живёт ${REPORT_LINK_TTL_SECONDS / 60} минут — её можно открыть без входа и переслать партнёру.`,
          { inline_keyboard: [[{ text: 'Открыть выписку', url }]] },
        )
      } catch (error) {
        console.error('report failed', error)
        await sendTelegramMessage(message.chat.id, 'Не получилось собрать выписку — попробуй позже.')
      }
      return jsonResponse({ ok: true })
    }

    if (command === '/refund') {
      await handleRefund(message, member)
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
