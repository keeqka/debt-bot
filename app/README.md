# app — Финансы Mini App (frontend)

React + TypeScript + Vite + shadcn/ui (Base UI + Tailwind v4) + Telegram Mini Apps SDK. See the [repo root README](../README.md) for the full setup/deploy story.

```bash
npm install
npm run dev      # http://localhost:5173 — runs in mock-data demo mode with no keys
npm run build    # type-check + production build
```

## Layout

- `src/lib/api.ts` — the only place screens should fetch/mutate data. Branches between real Supabase (`lib/supabase.ts`) and mock data (`lib/mock-data.ts`) based on `isBackendConfigured` (`lib/env.ts`).
- `src/hooks/use-finance-data.ts` — React Query hooks wrapping `lib/api.ts`.
- `src/routes/*` — one file per bottom-tab screen (Dashboard, Debts, Finances, Goals, Chat); Settings lives in `src/components/settings/SettingsPanel.tsx`, opened from the avatar in `TopBar`, not a route.
- `src/lib/debt-strategy.ts` — client-side avalanche simulation (mirrors the `debts-strategy` Edge Function's math) for instant UI feedback.
- `src/lib/telegram.ts` / `src/lib/auth.ts` — Telegram WebApp bridge and the initData → session JWT exchange.

To point this at a real backend, copy `.env.example` to `.env.local` and fill in `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
