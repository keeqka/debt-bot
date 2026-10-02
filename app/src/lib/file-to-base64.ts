export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '')
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * Фото с телефона может весить 5–10 МБ, а Claude принимает до 5 МБ на картинку:
 * сжимаем по длинной стороне до maxSide и отдаём JPEG. Скриншоту предложения
 * этого с запасом хватает для чтения мелкого шрифта.
 */
export async function imageToBase64Resized(file: File, maxSide = 1800): Promise<{ base64: string; mediaType: string }> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const dataUrl = canvas.toDataURL('image/jpeg', 0.88)
  return { base64: dataUrl.split(',')[1] ?? '', mediaType: 'image/jpeg' }
}
