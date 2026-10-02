-- Фаза 3 (SPEC-features.md): термины на твоих цифрах, разбор недели, финансовое здоровье.

-- Глубина объяснений терминов и день недели, когда приходит разбор недели (0 — воскресенье … 6 — суббота).
alter table users
  add column explain_level text not null default 'numbers' check (explain_level in ('simple', 'numbers', 'detailed')),
  add column weekly_review_dow smallint not null default 0 check (weekly_review_dow between 0 and 6);
grant update (explain_level, weekly_review_dow) on users to authenticated;

-- Челленджи недели: принимаются из разбора недели, прогресс считается по тратам или отмечается вручную.
create table challenges (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default current_household() references households(id) on delete cascade,
  user_id uuid not null default current_app_user() references users(id) on delete cascade,
  kind text not null check (kind in ('no_delivery', 'subscription_audit', 'coffee_home', 'pause_72h')),
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'done', 'failed', 'skipped')),
  est_saving numeric(14, 2) not null default 0,
  payload jsonb not null default '{}'::jsonb
);
create index challenges_user_active on challenges (user_id) where status = 'active';
alter table challenges enable row level security;
create policy household_access on challenges for all to authenticated
  using (household_id = current_household())
  with check (household_id = current_household() and user_id = current_app_user());

-- Финансовое здоровье: «не про меня» (na — пункт выпадает из знаменателя) и ручная отметка (done — для пункта-страховки).
create table health_overrides (
  household_id uuid not null default current_household() references households(id) on delete cascade,
  item text not null check (item in ('budget_history', 'cushion_1', 'no_overdue', 'no_expensive_debt', 'cushion_target', 'annual_reserve', 'insurance')),
  status text not null check (status in ('na', 'done')),
  primary key (household_id, item)
);
alter table health_overrides enable row level security;
create policy household_access on health_overrides for all to authenticated
  using (household_id = current_household()) with check (household_id = current_household());

-- Разбор недели хранится в ai_insights рядом с остальными итогами — тип enum надо расширить.
alter type ai_insight_type add value if not exists 'weekly_review';

-- Разбор недели приходит раз в неделю по дню пользователя: cron теперь стартует каждый день,
-- а cron-weekly-summary сам выбирает тех, у кого сегодня их день (weekly_review_dow).
select cron.schedule(
  'weekly-summary',
  '0 14 * * *', -- 19:00 Asia/Almaty (UTC+5) = 14:00 UTC, каждый день
  $$
  select net.http_post(
    url := 'https://twdywvyyjfaiisbaitxl.supabase.co/functions/v1/cron-weekly-summary',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer cd5e366df4320158b02709e8de52cc0d157a80b5d617d3b4f9b8f68971f75e69'),
    body := '{}'::jsonb
  );
  $$
);
