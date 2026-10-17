// Старый бот переехал на @hlowflow_bot. Его вебхук смотрит сюда: на любое сообщение,
// команду или нажатие кнопки функция отвечает ссылкой на нового бота.
//
// Ответ идёт прямо в теле HTTP-ответа на вебхук (Telegram умеет выполнять метод из ответа),
// поэтому токен старого бота в Supabase не нужен. Функция ничего не читает и не пишет в базу,
// секретов не использует: подделать запрос к ней можно, но ответ получит только тот, кто
// его прислал, — Telegram он не достигнет.
//
// Поставить вебхук старому боту (токен вводится скрыто):
//   read -rs T && curl -s "https://api.telegram.org/bot$T/setWebhook" \
//     -d "url=https://<PROJECT_REF>.supabase.co/functions/v1/legacy-bot-redirect" \
//     -d 'allowed_updates=["message","callback_query"]'; unset T

const NEW_BOT = 'hlowflow_bot'

// Код приглашения из «/start inv_…» пробрасываем дальше, чтобы человек по старой ссылке попал в нужную семью.
const INVITE_PAYLOAD = /^inv_[A-Za-z0-9_-]{1,60}$/

function json(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok')

  let update: Record<string, any>
  try {
    update = await req.json()
  } catch {
    return new Response('ok')
  }

  const message = update.message ?? update.callback_query?.message
  const chatId = message?.chat?.id
  // Только личные чаты: в группах бот не должен спамить ссылкой на каждое сообщение.
  if (!chatId || message?.chat?.type !== 'private') return new Response('ok')

  const text: string = update.message?.text ?? ''
  const payload = text.startsWith('/start ') ? text.slice(7).trim() : ''
  const url = `https://t.me/${NEW_BOT}${INVITE_PAYLOAD.test(payload) ? `?start=${payload}` : ''}`

  return json({
    method: 'sendMessage',
    chat_id: chatId,
    text: `Hlow Flow переехал в нового бота: @${NEW_BOT}\n\nВсе данные на месте. Открой его и нажми /start.`,
    reply_markup: { inline_keyboard: [[{ text: 'Открыть @' + NEW_BOT, url }]] },
  })
})
