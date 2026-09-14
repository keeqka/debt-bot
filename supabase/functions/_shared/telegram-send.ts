import { env } from './env.ts'

/** ТЗ §9: 3 retries with backoff before giving up on a notification send. */
export async function sendTelegramMessageWithRetry(chatId: number, text: string, attempts = 3): Promise<boolean> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${env.telegramBotToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
      })
      if (res.ok) return true
      console.error(`Telegram send failed (attempt ${attempt}): ${res.status} ${await res.text()}`)
    } catch (error) {
      console.error(`Telegram send threw (attempt ${attempt})`, error)
    }
    if (attempt < attempts) await new Promise((r) => setTimeout(r, attempt * 1000))
  }
  return false
}

export function assertCronSecret(req: Request) {
  const authHeader = req.headers.get('Authorization') ?? ''
  if (authHeader !== `Bearer ${env.cronSecret}`) {
    throw new Error('Unauthorized cron call')
  }
}
