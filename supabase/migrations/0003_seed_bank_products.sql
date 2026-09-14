-- ТЗ §16 №4: starting seed for the manually-curated bank_products reference
-- table. These figures are illustrative placeholders, not verified current
-- rates — replace with real numbers (and today's date) before relying on
-- goal-strategy recommendations, and re-curate periodically.

insert into bank_products (bank_name, product_name, type, rate_percent, term_months, min_amount, source_url, updated_at) values
  ('Halyk Bank', 'Депозит «Накопительный»', 'deposit', 14.5, 24, 50000, 'https://halykbank.kz/deposits', current_date),
  ('Kaspi Bank', 'Депозит Investor', 'deposit', 13.8, 12, 10000, 'https://kaspi.kz/deposits', current_date),
  ('Bank CenterCredit', 'Сберегательный счёт', 'savings_account', 11.2, null, 0, 'https://bcc.kz/savings', current_date);
