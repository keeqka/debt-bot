import { env } from './env.ts'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

/** Cheap/fast model for high-volume, low-complexity calls (ТЗ §7.2 auto-categorization). */
export const CLAUDE_MODEL_LIGHT = 'claude-haiku-4-5-20251001'
/** Default model for everything that needs real reasoning (receipts, status, strategies, chat). */
export const CLAUDE_MODEL_DEFAULT = 'claude-sonnet-5'

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string } }

interface ClaudeMessage {
  role: 'user' | 'assistant'
  content: string | ContentBlock[]
}

interface ToolDefinition {
  name: string
  description: string
  /** JSON Schema for the tool's input — this IS the response contract (ТЗ §7). */
  input_schema: Record<string, unknown>
}

/** A server tool Anthropic executes itself (e.g. web search) — no input_schema, no client-side handling. */
interface ServerToolDefinition {
  type: string
  name: string
  max_uses?: number
}

type AnyToolDefinition = ToolDefinition | ServerToolDefinition

/**
 * Anthropic's hosted web search tool. Used sparingly (debts-assist, ТЗ chat
 * request: "поискала в интернете актуальную инфу" when a screenshot doesn't
 * show something like the interest rate) — never for bank_products (ТЗ §16
 * №4 deliberately keeps that a curated table, not live search).
 */
export const WEB_SEARCH_TOOL: ServerToolDefinition = { type: 'web_search_20250305', name: 'web_search', max_uses: 3 }

interface CallClaudeToolOptions {
  model?: string
  system: string
  messages: ClaudeMessage[]
  tool: ToolDefinition
  maxTokens?: number
}

/**
 * Calls Claude with a single tool and forces its use via `tool_choice`, so
 * the response is guaranteed structured JSON matching `tool.input_schema`
 * instead of free text that needs fragile parsing (ТЗ §7 design note).
 */
export async function callClaudeTool<T>({ model = CLAUDE_MODEL_DEFAULT, system, messages, tool, maxTokens = 1500 }: CallClaudeToolOptions): Promise<T> {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.anthropicApiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages,
      tools: [tool],
      tool_choice: { type: 'tool', name: tool.name },
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Claude API error ${res.status}: ${text}`)
  }

  const data = await res.json()
  const toolUse = (data.content as Array<Record<string, unknown>>)?.find((block) => block.type === 'tool_use')
  if (!toolUse) throw new Error('Claude did not return a tool_use block')

  return toolUse.input as T
}

export type { ClaudeMessage, ContentBlock, ToolDefinition, ServerToolDefinition, AnyToolDefinition }

export interface ClaudeRawResponse {
  content: Array<Record<string, unknown>>
  stop_reason: string
}

/**
 * Full-fidelity call used by the chat advisor, which needs to see whether
 * Claude asked for a tool (model_purchase_impact, ТЗ §7.7) vs just replied
 * with text — `callClaudeTool` above always forces one tool and hides that
 * branch, so it doesn't fit the free-form conversation.
 */
export async function callClaudeRaw({
  model = CLAUDE_MODEL_DEFAULT,
  system,
  messages,
  tools,
  maxTokens = 800,
}: {
  model?: string
  system: string
  messages: ClaudeMessage[]
  tools?: AnyToolDefinition[]
  maxTokens?: number
}): Promise<ClaudeRawResponse> {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.anthropicApiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages, ...(tools ? { tools } : {}) }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Claude API error ${res.status}: ${text}`)
  }

  return res.json()
}
