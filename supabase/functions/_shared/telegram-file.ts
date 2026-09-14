import { env } from './env.ts'

/** Downloads a Telegram file (photo or document) and returns it as base64 + its mime type. */
export async function downloadTelegramFile(fileId: string, fallbackMimeType = 'image/jpeg'): Promise<{ data: string; mimeType: string }> {
  const getFileRes = await fetch(`https://api.telegram.org/bot${env.telegramBotToken}/getFile?file_id=${fileId}`)
  const getFileJson = await getFileRes.json()
  if (!getFileJson.ok) throw new Error(`getFile failed: ${JSON.stringify(getFileJson)}`)

  const filePath: string = getFileJson.result.file_path
  const fileRes = await fetch(`https://api.telegram.org/file/bot${env.telegramBotToken}/${filePath}`)
  if (!fileRes.ok) throw new Error(`File download failed: ${fileRes.status}`)

  const buffer = await fileRes.arrayBuffer()
  const data = btoa(String.fromCharCode(...new Uint8Array(buffer)))

  const mimeType = filePath.endsWith('.pdf')
    ? 'application/pdf'
    : filePath.endsWith('.png')
      ? 'image/png'
      : filePath.endsWith('.webp')
        ? 'image/webp'
        : fallbackMimeType

  return { data, mimeType }
}
