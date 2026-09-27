-- Модель денег семьи настраивается (app/src/lib/budget.ts читает эти поля):
--   priority_mode — куда идут деньги сверх обычных трат:
--     debts_first   сначала все долги, потом подушка и цели;
--     cushion_first сначала подушка на cushion_months, потом долги;
--     split         split_debt_pct % в долги, остальное в накопления;
--     ladder        стартовая подушка на 1 месяц → долги со ставкой от
--                   high_rate_threshold % → полная подушка → остальные долги → цели.
--   debt_strategy — порядок погашения: avalanche (ставка), snowball (остаток),
--                   cash_flow (остаток / минимальный платёж).
-- Одна строка на всю семью, как subscriptions (0012): данные общие на двоих.
create table household_settings (
  id smallint primary key default 1 check (id = 1),
  priority_mode text not null default 'debts_first'
    check (priority_mode in ('debts_first', 'cushion_first', 'split', 'ladder')),
  debt_strategy text not null default 'avalanche'
    check (debt_strategy in ('avalanche', 'snowball', 'cash_flow')),
  cushion_months numeric(4, 1) not null default 3 check (cushion_months between 1 and 12),
  split_debt_pct smallint not null default 50 check (split_debt_pct between 0 and 100),
  high_rate_threshold numeric(5, 2) not null default 15 check (high_rate_threshold between 0 and 100),
  updated_at timestamptz not null default now()
);

insert into household_settings (id) values (1) on conflict do nothing;

alter table household_settings enable row level security;
create policy "authenticated_full_access" on household_settings for all to authenticated using (true) with check (true);

-- Подушка безопасности — это обычная цель с пометкой: её пополняют так же,
-- а бюджет читает её накопленное как резерв.
alter table goals add column is_cushion boolean not null default false;

-- Чат может предложить поменять настройки: что меняется и как это сдвинет
-- план. Применяется только после тапа «Применить».
alter table chat_messages add column proposed_settings jsonb;
