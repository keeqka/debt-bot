-- Holding area between "user sent a photo/PDF straight to the bot" and
-- "user tapped ✅ Добавить on the inline-keyboard confirmation" — Telegram's
-- callback_data is capped at 64 bytes, nowhere near enough to carry a full
-- parsed receipt, so we store the draft here and pass only its id around.
-- Same confirm-before-save rule as everywhere else AI touches money data.

create table pending_expense_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

alter table pending_expense_drafts enable row level security;

-- Only the webhook (service role, bypasses RLS) ever touches this table —
-- still gate it the same way as everything else for consistency/defense in depth.
create policy "authenticated_full_access" on pending_expense_drafts for all to authenticated using (true) with check (true);
