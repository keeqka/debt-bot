// ТЗ §8: receives Telegram bot updates. Its main job is `/start` — Telegram
// only allows a bot to message a user proactively (weekly/monthly summaries,
// ТЗ §9) after that user has started a conversation with it at least once.

import { jsonResponse } from '../_shared/cors.ts'
import { env } from '../_shared/env.ts'

async function sendTelegramMessage(chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${env.telegramBotToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  })
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
    const message = update.message

    if (message?.text === '/start') {
      const isAllowed = env.allowedTelegramIds.includes(message.from.id)
      await sendTelegramMessage(
        message.chat.id,
        isAllowed
          ? 'Привет! Открой Mini App из меню бота, чтобы посмотреть свои финансы. Еженедельные и ежемесячные сводки теперь будут приходить сюда.'
          : 'Это приложение настроено для конкретных пользователей — обратитесь к тем, кто его подключал.',
      )
    }

    return jsonResponse({ ok: true })
  } catch (error) {
    console.error('telegram-webhook failed', error)
    return jsonResponse({ ok: false }, 200) // always 200 so Telegram doesn't retry-storm us
  }
})
