-- 1) Маскот «Чек» реагирует на то, что говорит: каждый ответ чата хранит
--    выражение лица, с которым он сказан (calm / focused / happy / alert /
--    thinking), — чтобы и история показывала то же лицо, что было в момент ответа.
alter table chat_messages
  add column expression text check (expression in ('calm', 'focused', 'happy', 'alert', 'thinking'));

-- 2) Платёж, который гасит остаток до нуля, закрывает долг. Раньше долг
--    оставался active с нулевым остатком, и его минимальный платёж продолжал
--    считаться обязательным в бюджете месяца (app/src/lib/budget.ts).
create or replace function apply_debt_payment() returns trigger as $$
begin
  update debts
     set current_balance = greatest(0, current_balance - new.amount),
         status = case when current_balance - new.amount <= 0 then 'closed'::debt_status else status end
   where id = new.debt_id;
  return new;
end;
$$ language plpgsql;

update debts set status = 'closed' where status = 'active' and current_balance = 0;
