/** The Telegram bot behind the Mini App — same as the landing's TELEGRAM_BOT_URL. */
export const BOT_USERNAME = 'aibasedfinancecontrolbot_bot'

/** Invite link: opens the bot, which answers with a button into the app carrying the code. */
export function inviteLink(code: string) {
  return `https://t.me/${BOT_USERNAME}?start=inv_${code}`
}

/** Share sheet for a link, in Telegram's own UI. */
export function shareLink(url: string, text: string) {
  return `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`
}

/** For someone without access: the bot forwards the request to the admins. */
export const REQUEST_ACCESS_URL = `https://t.me/${BOT_USERNAME}?start=request`
