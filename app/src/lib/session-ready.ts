/**
 * Resolves once initSession (lib/auth.ts) has settled — whichever way that
 * went: a real Telegram session JWT landed, or the mock/anon fallback was
 * chosen instead. TanStack Query hooks fire their query fn immediately on
 * mount, but initSession only finishes after an async round trip, and
 * main.tsx deliberately does NOT block the first render on it (a stuck,
 * slow, or failing auth call must never leave the whole app on a blank
 * screen — see that file's own comment).
 *
 * Without this gate, any authenticated request issued before that round
 * trip completes goes out with no session JWT. RLS silently filters it to
 * an empty result rather than erroring (see lib/supabase.ts's own comment
 * on this), so the screen looks like nothing loaded — until some unrelated
 * mutation's invalidateQueries happens to refetch that one query later,
 * with the JWT now in place. lib/supabase.ts awaits this before every
 * authenticated request (table reads and edge function calls alike, except
 * auth-telegram itself — waiting there would deadlock against the thing
 * that resolves this).
 */
let resolveSessionReady: () => void = () => {}
export const sessionReady = new Promise<void>((resolve) => {
  resolveSessionReady = resolve
})

export function markSessionReady() {
  resolveSessionReady()
}
