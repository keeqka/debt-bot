// Bank statement import: unlike a single receipt (receipt-tool.ts), a
// monthly statement can hold dozens of transactions, so this asks Claude to
// return the whole list at once and relies on a much higher max_tokens.
// Nothing is written to the database here — statement-parse only returns
// the parsed list; the frontend always shows a per-transaction review
// screen (checkboxes + editable amount/category) before any bulk insert,
// same confirm-before-save rule as every other AI extraction in this app.

import { callClaudeTool, type ContentBlock } from './claude.ts'
import { currencyInstruction } from './currency.ts'

export const STATEMENT_TOOL = {
  name: 'record_statement',
  description: 'Structured list of transactions extracted from a bank statement (PDF or screenshot) covering some period.',
  input_schema: {
    type: 'object',
    properties: {
      is_valid_statement: { type: 'boolean', description: 'false if the file is not a bank statement or transaction list' },
      transactions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            date: { type: 'string', description: 'ISO 8601 date, e.g. 2026-09-10' },
            description: { type: 'string', description: 'merchant or counterparty exactly as shown in the statement' },
            amount: { type: 'number', description: 'always positive' },
            direction: { type: 'string', enum: ['expense', 'income'], description: 'expense for outgoing/purchases, income for incoming/salary/transfers in' },
            suggested_category: { type: ['string', 'null'], description: 'for direction=expense only: one of the provided category names, or null' },
            confidence: { type: 'number', description: '0 to 1' },
          },
          required: ['date', 'description', 'amount', 'direction', 'confidence'],
        },
      },
    },
    required: ['is_valid_statement', 'transactions'],
  },
}

export interface StatementTransaction {
  date: string
  description: string
  amount: number
  direction: 'expense' | 'income'
  suggested_category: string | null
  confidence: number
}

export interface StatementResult {
  is_valid_statement: boolean
  transactions: StatementTransaction[]
}

export async function parseStatementFile(
  fileBase64: string,
  mimeType: string,
  expenseCategoryNames: string[],
  currency: string,
): Promise<StatementResult> {
  const fileBlock: ContentBlock =
    mimeType === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 } }
      : { type: 'image', source: { type: 'base64', media_type: mimeType, data: fileBase64 } }

  return callClaudeTool<StatementResult>({
    system: `Ты разбираешь банковскую выписку за период (PDF или скриншот) и извлекаешь КАЖДУЮ видимую операцию по счёту/карте. Для каждой операции определи дату, описание (магазин/контрагент как в выписке), сумму (всегда положительное число) и направление: "expense" для списаний/покупок/платежей, "income" для поступлений/зарплаты/переводов на счёт. Для расходов предложи категорию строго из списка: ${expenseCategoryNames.join(', ')} (иначе null). Пропускай служебные строки вроде "остаток на начало/конец периода" — это не операции. Если файл вообще не похож на банковскую выписку — верни is_valid_statement=false и пустой список транзакций. ${currencyInstruction(currency)} Не придумывай операции, которых нет в файле.`,
    messages: [{ role: 'user', content: [fileBlock, { type: 'text', text: 'Разбери эту выписку и верни список всех операций.' }] }],
    tool: STATEMENT_TOOL,
    maxTokens: 8192,
  })
}
