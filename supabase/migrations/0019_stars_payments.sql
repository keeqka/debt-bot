-- Оплата звёздами Telegram (XTR) — подписка 500 ⭐ на 30 дней. Пока доступ
-- по приглашению бесплатный, так что подписка работает как донат: она не
-- открывает функций, а отмечает, что семья поддерживает проект до paid_until.
-- Когда оплата станет обязательной, доступ будет проверяться по paid_until.

create table payments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  telegram_payment_charge_id text not null unique, -- нужен для возврата (refundStarPayment)
  amount_stars int not null check (amount_stars > 0),
  is_recurring boolean not null default false,
  subscription_expires_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now()
);

create index payments_household_idx on payments (household_id);

alter table payments enable row level security;
create policy payments_read on payments for select to authenticated using (household_id = current_household());
-- Пишет только бот (service role) — по successful_payment от Telegram.

alter table subscriptions add column paid_until timestamptz;
