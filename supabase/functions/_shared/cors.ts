export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/**
 * Error responses include the real message (not just a static string) so
 * failures are debuggable without dashboard/CLI log access — this is an
 * internal 2-person tool behind the Telegram whitelist, not a public API, so
 * that tradeoff is fine here.
 */
export function jsonError(fallbackMessage: string, error: unknown, status = 500): Response {
  const detail = error instanceof Error ? error.message : String(error)
  console.error(fallbackMessage, error)
  return jsonResponse({ error: fallbackMessage, detail }, status)
}

export function handleOptions(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  return null
}
