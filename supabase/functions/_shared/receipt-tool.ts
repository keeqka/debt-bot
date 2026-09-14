// Shared by receipts-parse (Mini App photo upload) and telegram-webhook
// (photo/PDF sent straight to the bot chat) — same extraction contract
// either way (ТЗ §7.1).

import { callClaudeTool, type ContentBlock } from './claude.ts'

export const RECEIPT_TOOL = {
  name: 'record_receipt',
  description: 'Structured data extracted from a photographed receipt or payment screenshot.',
  input_schema: {
    type: 'object',
    properties: {
      is_valid_receipt: { type: 'boolean', description: 'false if the image is not a receipt or payment confirmation' },
      merchant: { type: ['string', 'null'] },
      date: { type: ['string', 'null'], description: 'ISO 8601 date, e.g. 2026-09-10' },
      total_amount: { type: ['number', 'null'] },
      currency: { type: ['string', 'null'], description: '3-letter ISO code, e.g. KZT' },
      line_items: {
        type: 'array',
        items: {
          type: 'object',
          properties: { name: { type: 'string' }, amount: { type: 'number' } },
          required: ['name', 'amount'],
        },
      },
      suggested_category: { type: ['string', 'null'], description: 'One of the provided category names, or null' },
      confidence: { type: 'number', description: '0 to 1' },
    },
    required: ['is_valid_receipt', 'line_items', 'confidence'],
  },
}

export interface ReceiptResult {
  is_valid_receipt: boolean
  merchant: string | null
  date: string | null
  total_amount: number | null
  currency: string | null
  line_items: { name: string; amount: number }[]
  suggested_category: string | null
  confidence: number
}

export async function parseReceiptFile(fileBase64: string, mimeType: string, categoryNames: string[]): Promise<ReceiptResult> {
  const fileBlock: ContentBlock =
    mimeType === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 } }
      : { type: 'image', source: { type: 'base64', media_type: mimeType, data: fileBase64 } }

  return callClaudeTool<ReceiptResult>({
    system: `Ты помогаешь разобрать чек или скриншот банковского перевода/платежа. Извлеки магазина/получателя, дату, сумму, валюту и предложи категорию строго из списка: ${categoryNames.join(', ')}. Если это не финансовый документ — верни is_valid_receipt=false. Не придумывай данные, которых нет в файле.`,
    messages: [{ role: 'user', content: [fileBlock, { type: 'text', text: 'Разбери этот чек.' }] }],
    tool: RECEIPT_TOOL,
  })
}
