-- Фаза 1 (SPEC-features.md): досрочка, пауза перед покупкой, деньги «в долг», тон бота.

-- Ежемесячный взнос сверх минимума по конкретному долгу (экран «Досрочка»).
-- Бюджет считает его частью обязательных платежей: он уменьшает «сверх минимумов»
-- и входит в платёж этого долга в симуляции (lib/budget.ts).
alter table debts add column extra_monthly numeric(14, 2) not null default 0 check (extra_monthly >= 0);

-- Правило паузы: покупка дороже порога — сначала «Напомнить через N ч».
-- windfall: доля разового дохода, которую предлагается отправить в долг (0-100).
alter table household_settings
  add column pause_threshold numeric(14, 2) check (pause_threshold is null or pause_threshold >= 0),
  add column pause_hours smallint not null default 24 check (pause_hours in (24, 72)),
  add column windfall_to_debt_pct smallint not null default 0 check (windfall_to_debt_pct between 0 and 100);

-- Голос «Чека»: попадает в системный промпт chat и cron-*.
alter table users add column bot_tone text not null default 'neutral' check (bot_tone in ('soft', 'neutral', 'direct'));
grant update (bot_tone) on users to authenticated;

-- Напоминания «вернись к покупке через N часов»; шлёт cron-daily-reminder (раз в час).
create table reminders (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default current_household() references households(id) on delete cascade,
  user_id uuid not null default current_app_user() references users(id) on delete cascade,
  fire_at timestamptz not null,
  kind text not null check (kind in ('pause_purchase')),
  payload jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index reminders_due on reminders (fire_at) where sent_at is null;
alter table reminders enable row level security;
create policy household_access on reminders for all to authenticated
  using (household_id = current_household())
  with check (household_id = current_household() and user_id = current_app_user());

-- Богатая карточка под ответом чата: { kind: 'offer' | 'debt_check', … } — разбор
-- скриншота банковского предложения (OfferWidget, 08) и проверка нового долга (07).
alter table chat_messages add column card jsonb;
