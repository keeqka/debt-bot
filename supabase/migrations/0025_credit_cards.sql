-- Кредитные карты: тип долга, лимит и «снятия» (деньги забрали с карты — долг вырос).

alter table debts
  add column kind text not null default 'loan' check (kind in ('loan', 'credit_card')),
  add column credit_limit numeric(14, 2) check (credit_limit is null or credit_limit > 0);

-- Уже заведённые карты опознаём по названию; ошибиться можно — тип меняется в «Редактировать».
update debts set kind = 'credit_card' where title ~* 'кредитк|кредитная карт|кредитной карт|credit';

create table debt_draws (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default current_household() references households(id) on delete cascade,
  debt_id uuid not null references debts(id) on delete cascade,
  amount numeric(14, 2) not null check (amount > 0),
  drawn_at date not null default current_date,
  note text
);
create index debt_draws_household_idx on debt_draws (household_id);
create index debt_draws_debt_idx on debt_draws (debt_id, drawn_at desc);
alter table debt_draws enable row level security;
create policy household_access on debt_draws for all to authenticated
  using (household_id = current_household()) with check (household_id = current_household());

-- Снятие увеличивает остаток. Лимит не даёт уйти выше; закрытая (погашенная) карта снова становится активной;
-- «сумма долга» подтягивается к остатку, чтобы прогресс погашения не уходил в минус.
create or replace function apply_debt_draw() returns trigger as $$
declare
  d debts%rowtype;
begin
  select * into d from debts where id = new.debt_id for update;
  if d.kind <> 'credit_card' then
    raise exception 'Снятие доступно только для кредитной карты';
  end if;
  if d.credit_limit is not null and d.current_balance + new.amount > d.credit_limit then
    raise exception 'Превышен лимит карты: доступно %', greatest(0, d.credit_limit - d.current_balance);
  end if;
  update debts
     set current_balance = d.current_balance + new.amount,
         principal_amount = greatest(d.principal_amount, d.current_balance + new.amount),
         status = 'active'
   where id = d.id;
  return new;
end;
$$ language plpgsql;

create trigger debt_draws_apply after insert on debt_draws
  for each row execute function apply_debt_draw();
