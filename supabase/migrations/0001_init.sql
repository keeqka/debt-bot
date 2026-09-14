-- ТЗ §4: schema for the 2-user shared household finance tracker.
-- Data is shared between both users (see ТЗ §16 "спорное место №1"): every
-- table is readable/writable by any authenticated (whitelisted) user, with
-- user_id/owner_user_id kept only for attribution, not row-level ownership.

create extension if not exists "pgcrypto";

-- ========== users ==========
create table users (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint not null unique,
  display_name text not null,
  username text,
  avatar_url text,
  timezone text not null default 'Asia/Almaty',
  created_at timestamptz not null default now()
);

-- ========== categories ==========
create type category_type as enum ('expense', 'income');

create table categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  icon text not null default 'more-horizontal',
  type category_type not null,
  is_system boolean not null default false
);

insert into categories (name, icon, type, is_system) values
  ('Продукты', 'shopping-cart', 'expense', true),
  ('Транспорт', 'car', 'expense', true),
  ('Жильё', 'home', 'expense', true),
  ('Развлечения', 'popcorn', 'expense', true),
  ('Здоровье', 'heart-pulse', 'expense', true),
  ('Прочее', 'more-horizontal', 'expense', true),
  ('Зарплата', 'wallet', 'income', true),
  ('Фриланс', 'laptop', 'income', true);

-- ========== debts ==========
create type debt_status as enum ('active', 'closed');

create table debts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references users(id) on delete cascade,
  title text not null,
  creditor text not null,
  principal_amount numeric(14, 2) not null check (principal_amount > 0),
  current_balance numeric(14, 2) not null check (current_balance >= 0),
  currency text not null default 'KZT',
  interest_rate numeric(5, 2),
  minimum_payment numeric(14, 2) not null default 0,
  due_day smallint check (due_day between 1 and 31),
  status debt_status not null default 'active',
  notes text,
  created_at timestamptz not null default now()
);

create table debt_payments (
  id uuid primary key default gen_random_uuid(),
  debt_id uuid not null references debts(id) on delete cascade,
  amount numeric(14, 2) not null check (amount > 0),
  paid_at date not null default current_date,
  is_extra boolean not null default false,
  note text
);

-- Keep debts.current_balance in sync with recorded payments.
create or replace function apply_debt_payment() returns trigger as $$
begin
  update debts set current_balance = greatest(0, current_balance - new.amount) where id = new.debt_id;
  return new;
end;
$$ language plpgsql;

create trigger trg_apply_debt_payment
  after insert on debt_payments
  for each row execute function apply_debt_payment();

-- ========== incomes ==========
create table incomes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  source text not null,
  amount numeric(14, 2) not null check (amount > 0),
  currency text not null default 'KZT',
  received_at date not null default current_date,
  is_recurring boolean not null default false,
  recurrence_day smallint check (recurrence_day between 1 and 31)
);

-- ========== expenses ==========
create type expense_source as enum ('manual', 'receipt_photo', 'screenshot');

create table expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  amount numeric(14, 2) not null check (amount > 0),
  currency text not null default 'KZT',
  category_id uuid references categories(id) on delete set null,
  merchant text,
  spent_at date not null default current_date,
  description text,
  source expense_source not null default 'manual',
  receipt_asset_path text,
  ai_confidence numeric(3, 2) check (ai_confidence between 0 and 1),
  is_confirmed boolean not null default true,
  created_at timestamptz not null default now()
);

create index idx_expenses_spent_at on expenses (spent_at desc);
create index idx_incomes_received_at on incomes (received_at desc);

-- ========== goals ==========
create type goal_status as enum ('active', 'achieved', 'paused');

create table goals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  target_amount numeric(14, 2) not null check (target_amount > 0),
  current_amount numeric(14, 2) not null default 0,
  target_date date,
  currency text not null default 'KZT',
  status goal_status not null default 'active',
  ai_strategy jsonb,
  updated_at timestamptz not null default now()
);

-- ========== bank_products (справочник РК, курируется вручную — ТЗ §16 №4) ==========
create type bank_product_type as enum ('deposit', 'savings_account');

create table bank_products (
  id uuid primary key default gen_random_uuid(),
  bank_name text not null,
  product_name text not null,
  type bank_product_type not null,
  rate_percent numeric(5, 2) not null,
  term_months smallint,
  min_amount numeric(14, 2),
  source_url text not null,
  updated_at date not null default current_date
);

-- ========== ai_insights ==========
create type ai_insight_type as enum ('status', 'weekly_summary', 'monthly_summary', 'debt_strategy', 'goal_strategy');

create table ai_insights (
  id uuid primary key default gen_random_uuid(),
  type ai_insight_type not null,
  payload jsonb not null,
  sent_to_telegram boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_ai_insights_type_created on ai_insights (type, created_at desc);

-- ========== chat_messages ==========
create type chat_role as enum ('user', 'assistant', 'tool');

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  role chat_role not null,
  content text not null,
  context_snapshot jsonb,
  created_at timestamptz not null default now()
);

create index idx_chat_messages_created_at on chat_messages (created_at asc);

-- ========== Row Level Security ==========
-- The whitelist check (exactly 2 Telegram IDs) happens once, in the
-- auth-telegram Edge Function, at JWT mint time (ТЗ §2). Every table here is
-- shared household data, so RLS only needs to gate "authenticated at all" —
-- there is no per-row ownership to filter by. anon/unauthenticated requests
-- are denied outright.

alter table users enable row level security;
alter table debts enable row level security;
alter table debt_payments enable row level security;
alter table incomes enable row level security;
alter table expenses enable row level security;
alter table categories enable row level security;
alter table goals enable row level security;
alter table bank_products enable row level security;
alter table ai_insights enable row level security;
alter table chat_messages enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'users', 'debts', 'debt_payments', 'incomes', 'expenses',
    'categories', 'goals', 'bank_products', 'ai_insights', 'chat_messages'
  ]
  loop
    execute format(
      'create policy "authenticated_full_access" on %I for all to authenticated using (true) with check (true)',
      t
    );
  end loop;
end $$;
