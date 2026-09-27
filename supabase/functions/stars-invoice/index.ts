// Счёт на подписку звёздами Telegram (XTR, 30 дней). Mini App открывает его
// через Telegram.WebApp.openInvoice; об оплате Telegram сообщает боту
// (telegram-webhook: pre_checkout_query → successful_payment), там подписка
// и записывается. Цифровое внутри Telegram оплачивается только звёздами.

import { handleOptions, jsonResponse, jsonError } from '../_shared/cors.ts'
import { requireSession } from '../_shared/auth.ts'
import { env } from '../_shared/env.ts'
import { STARS_PRICE, SUBSCRIPTION_PERIOD_SECONDS, encodePayload } from '../_shared/stars.ts'

Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  try {
    const session = await requireSession(req)

    const res = await fetch(`https://api.telegram.org/bot${env.telegramBotToken}/createInvoiceLink`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Hlow Flow — поддержка',
        description: 'Подписка на месяц. Сейчас доступ бесплатный по приглашению — подписка помогает проекту жить.',
        payload: encodePayload({ householdId: session.household_id, userId: session.sub }),
        currency: 'XTR',
        prices: [{ label: 'Месяц Hlow Flow', amount: STARS_PRICE }],
        subscription_period: SUBSCRIPTION_PERIOD_SECONDS,
      }),
    })
    const body = await res.json()
    if (!body.ok) throw new Error(`createInvoiceLink: ${body.description ?? res.status}`)

    return jsonResponse({ url: body.result })
  } catch (error) {
    return jsonError('Не удалось создать счёт', error)
  }
})
