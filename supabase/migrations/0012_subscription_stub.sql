-- Hlow Flow redesign §9 (paid tier). No real payment integration yet — this
-- is the UI-only stub the user asked for; `status`/`activated_at` are
-- designed to be left as-is once a real payment webhook lands later, so the
-- schema doesn't need to change again.
--
-- One row for the whole household (0001_init.sql: all data is shared
-- between the 2 whitelisted users, no per-row ownership) — seeded once
-- below, never inserted again from application code.
create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'free' check (status in ('free', 'active')),
  activated_at timestamptz
);

insert into subscriptions default values;

-- One row per receipt/statement PARSE ATTEMPT (success or failure — a
-- failed read still cost a Claude call and should still count against the
-- free-tier limit, or the limit is trivially farmable by re-uploading a bad
-- photo).
create table receipt_scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index idx_receipt_scans_created_at on receipt_scans (created_at asc);

alter table subscriptions enable row level security;
alter table receipt_scans enable row level security;

create policy "authenticated_full_access" on subscriptions for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on receipt_scans for all to authenticated using (true) with check (true);
