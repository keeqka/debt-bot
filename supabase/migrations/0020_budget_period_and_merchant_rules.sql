-- Бюджетный месяц: null — календарный (1-е … последнее число), иначе день
-- (1-31), с которого месяц начинается, — обычно день зарплаты. Месяц тогда
-- идёт от этого числа до такого же числа следующего месяца (31 в коротком
-- месяце — последний день). Читает app/src/lib/budget.ts.
alter table household_settings
  add column period_start_day smallint check (period_start_day between 1 and 31);

-- Правила магазинов: один раз поправил категорию — дальше чеки и выписки с
-- этим магазином сразу идут туда, без догадок ИИ. merchant_key — нормализованное
-- название (app/src/lib/merchant.ts, копия в supabase/functions/_shared/),
-- merchant_label — как оно выглядело в выписке, для списка в настройках.
create table merchant_rules (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default current_household() references households(id) on delete cascade,
  merchant_key text not null,
  merchant_label text not null,
  category_id uuid not null references categories(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (household_id, merchant_key)
);

alter table merchant_rules enable row level security;
create policy household_access on merchant_rules for all to authenticated
  using (household_id = current_household()) with check (household_id = current_household());
