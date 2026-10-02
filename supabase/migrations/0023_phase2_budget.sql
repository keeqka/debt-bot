-- Фаза 2 (SPEC-features.md): прогноз конца месяца, крупные траты года, модель бюджета.

-- Крупные траты года: страховка, отпуск, налог. Резерв в месяц = (amount − saved) / месяцев до срока;
-- он входит в обязательства бюджета (app/src/lib/budget.ts), поэтому план по долгам и подушке меняется.
create table annual_expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default current_household() references households(id) on delete cascade,
  title text not null,
  amount numeric(14, 2) not null check (amount > 0),
  month smallint not null check (month between 1 and 12),
  saved numeric(14, 2) not null default 0 check (saved >= 0),
  created_at timestamptz not null default now()
);
alter table annual_expenses enable row level security;
create policy household_access on annual_expenses for all to authenticated
  using (household_id = current_household()) with check (household_id = current_household());

-- Режим прогноза «Обзора» и модель оценки месяца. Модель влияет только на оценку и status,
-- но не на цифру «можно тратить».
alter table household_settings
  add column forecast_mode text not null default 'normal' check (forecast_mode in ('cautious', 'normal', 'optimistic')),
  add column budget_model text not null default '50_30_20' check (budget_model in ('50_30_20', 'zero_based', 'pay_yourself_first'));

-- Нужное / желание: основа модели 50/30/20 и «индекса свободы». null — ещё не спрашивали
-- (у пользовательских категорий приложение спросит один раз); неизвестное считается нужным.
alter table categories add column need_kind text check (need_kind in ('need', 'want'));
update categories set need_kind = 'need' where is_system and household_id is null and name in ('Продукты', 'Транспорт', 'Жильё', 'Здоровье');
update categories set need_kind = 'want' where is_system and household_id is null and name in ('Развлечения', 'Прочее');
