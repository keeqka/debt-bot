/** Friendly display names for the Claude model ids we use server-side (see supabase/functions/_shared/claude.ts). */
const MODEL_LABELS: Record<string, string> = {
  'claude-sonnet-5': 'Claude Sonnet 5',
  'claude-haiku-4-5-20251001': 'Claude Haiku 4.5',
  'claude-opus-5': 'Claude Opus 5',
  'claude-fable-5-1': 'Claude Fable 5.1',
}

export function modelLabel(modelId: string | null | undefined): string | null {
  if (!modelId) return null
  return MODEL_LABELS[modelId] ?? modelId
}
