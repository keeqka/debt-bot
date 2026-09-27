-- Из приложения на одну семью — в приложение на несколько семей.
--
-- Было: все данные общие для любого вошедшего (0001: using (true)), белый
-- список из двух Telegram ID в секретах функций.
-- Стало: у каждой строки есть household_id; вошедший видит и меняет только
-- строки своей семьи. Семья — это владелец и максимум один партнёр. Всего
-- людей в приложении — не больше app_config.max_users (сейчас 5).
-- Попасть внутрь можно только по одноразовому приглашению:
--   household — новая семья, создаёт только админ;
--   partner   — второй человек в семью, создаёт любой её участник.
-- Правила (лимит, «не больше двух», одноразовость) держит сама база — в
-- функциях redeem_invite / create_invite_for под одной блокировкой, чтобы два
-- одновременных входа не обошли лимит.
--
-- Все нынешние данные становятся семьёй №1, оба нынешних пользователя — её
-- участники и админы.
--
-- Семья определяется из JWT сессии: auth-telegram кладёт туда household_id,
-- current_household() его читает. Колонки household_id по умолчанию берут
-- его же — клиенту не нужно передавать семью при вставке.

-- ========== семьи и настройки приложения ==========
create table households (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

insert into households (id) values ('00000000-0000-0000-0000-000000000001');

create table app_config (
  id smallint primary key default 1 check (id = 1),
  max_users int not null default 5 check (max_users > 0),
  max_members_per_household int not null default 2 check (max_members_per_household between 1 and 10)
);
insert into app_config default values;

create or replace function current_household() returns uuid
language sql stable as $$
  select nullif(coalesce(current_setting('request.jwt.claims', true), '{}')::json ->> 'household_id', '')::uuid
$$;

create or replace function current_app_user() returns uuid
language sql stable as $$
  select nullif(coalesce(current_setting('request.jwt.claims', true), '{}')::json ->> 'sub', '')::uuid
$$;

-- ========== пользователи ==========
alter table users add column household_id uuid references households(id) on delete restrict;
alter table users add column is_admin boolean not null default false;
update users set household_id = '00000000-0000-0000-0000-000000000001', is_admin = true;
alter table users alter column household_id set not null;
create index users_household_idx on users (household_id);

drop policy if exists "authenticated_full_access" on users;
create policy users_read on users for select to authenticated using (household_id = current_household());
create policy users_update on users for update to authenticated
  using (household_id = current_household()) with check (household_id = current_household());

-- Себя в админы или в чужую семью не перевести: клиенту можно менять только
-- профильные поля. Создание пользователей — только через redeem_invite.
revoke insert, update, delete on users from authenticated;
grant update (display_name, username, avatar_url, timezone, monthly_income, payday,
              daily_reminder_enabled, daily_reminder_time, vacation_paused, onboarding_completed_at)
  on users to authenticated;

-- ========== данные семьи ==========
do $$
declare
  t text;
begin
  foreach t in array array[
    'debts', 'debt_payments', 'incomes', 'expenses', 'goals', 'ai_insights',
    'chat_messages', 'pending_expense_drafts', 'receipt_scans', 'subscriptions', 'household_settings'
  ]
  loop
    execute format('alter table %I add column household_id uuid references households(id) on delete cascade', t);
    execute format('update %I set household_id = %L', t, '00000000-0000-0000-0000-000000000001');
    execute format('alter table %I alter column household_id set not null', t);
    execute format('alter table %I alter column household_id set default current_household()', t);
    execute format('create index %I on %I (household_id)', t || '_household_idx', t);
    execute format('drop policy if exists "authenticated_full_access" on %I', t);
    execute format(
      'create policy household_access on %I for all to authenticated using (household_id = current_household()) with check (household_id = current_household())',
      t
    );
  end loop;
end $$;

-- Настройки и тариф — по одной строке на семью (раньше одна на всё приложение).
alter table household_settings drop constraint household_settings_pkey;
alter table household_settings drop column id;
alter table household_settings add primary key (household_id);

alter table subscriptions add constraint subscriptions_household_unique unique (household_id);
-- Семьи по приглашению — полный доступ бесплатно (до запуска оплаты звёздами).
alter table subscriptions add column complimentary boolean not null default false;
update subscriptions set status = 'active', activated_at = coalesce(activated_at, now()), complimentary = true;

-- ========== категории: системные общие, свои — у семьи ==========
alter table categories add column household_id uuid references households(id) on delete cascade;
update categories set household_id = '00000000-0000-0000-0000-000000000001' where not is_system;
alter table categories alter column household_id set default current_household();
create index categories_household_idx on categories (household_id);

drop policy if exists "authenticated_full_access" on categories;
create policy categories_read on categories for select to authenticated
  using (household_id is null or household_id = current_household());
create policy categories_insert on categories for insert to authenticated
  with check (household_id = current_household());
create policy categories_update on categories for update to authenticated
  using (household_id = current_household()) with check (household_id = current_household());
create policy categories_delete on categories for delete to authenticated
  using (household_id = current_household());

-- ========== семьи видны только своим ==========
alter table households enable row level security;
create policy households_read on households for select to authenticated using (id = current_household());

alter table app_config enable row level security; -- читается только через access_info()

-- ========== приглашения ==========
create table invites (
  code text primary key,
  kind text not null check (kind in ('household', 'partner')),
  household_id uuid references households(id) on delete cascade,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_by uuid references users(id) on delete set null,
  used_at timestamptz,
  check ((kind = 'partner') = (household_id is not null))
);
alter table invites enable row level security; -- только через функции ниже

create or replace function create_invite_for(p_user uuid, p_kind text) returns text
language plpgsql security definer set search_path = public as $$
declare
  me users%rowtype;
  cfg app_config%rowtype;
  new_code text;
begin
  perform pg_advisory_xact_lock(hashtext('hlow_flow_membership'));
  select * into me from users where id = p_user;
  if not found then raise exception 'not_member'; end if;
  select * into cfg from app_config where id = 1;
  if (select count(*) from users) >= cfg.max_users then raise exception 'limit_reached'; end if;

  if p_kind = 'partner' then
    if (select count(*) from users where household_id = me.household_id) >= cfg.max_members_per_household then
      raise exception 'family_full';
    end if;
    -- Одна живая ссылка на партнёра: новая отменяет прежнюю.
    delete from invites where household_id = me.household_id and kind = 'partner' and used_at is null;
  elsif p_kind = 'household' then
    if not me.is_admin then raise exception 'forbidden'; end if;
  else
    raise exception 'bad_kind';
  end if;

  new_code := substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
  insert into invites (code, kind, household_id, created_by)
  values (new_code, p_kind, case when p_kind = 'partner' then me.household_id end, me.id);
  return new_code;
end $$;

-- Из приложения: автор — тот, чья сессия.
create or replace function create_invite(p_kind text) returns text
language plpgsql security definer set search_path = public as $$
begin
  if current_app_user() is null then raise exception 'not_member'; end if;
  return create_invite_for(current_app_user(), p_kind);
end $$;

-- Вход по приглашению: создаёт пользователя (и семью, если это приглашение
-- в новую семью) атомарно, под той же блокировкой, что и выдача приглашений.
create or replace function redeem_invite(
  p_code text, p_telegram_id bigint, p_display_name text, p_username text, p_avatar_url text
) returns users
language plpgsql security definer set search_path = public as $$
declare
  inv invites%rowtype;
  cfg app_config%rowtype;
  hh uuid;
  u users%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext('hlow_flow_membership'));

  select * into u from users where telegram_id = p_telegram_id;
  if found then return u; end if;

  select * into inv from invites where code = p_code for update;
  if not found or inv.used_at is not null or inv.expires_at < now() then raise exception 'invite_invalid'; end if;

  select * into cfg from app_config where id = 1;
  if (select count(*) from users) >= cfg.max_users then raise exception 'limit_reached'; end if;

  if inv.kind = 'household' then
    insert into households default values returning id into hh;
    insert into household_settings (household_id) values (hh);
    insert into subscriptions (household_id, status, activated_at, complimentary) values (hh, 'active', now(), true);
  else
    hh := inv.household_id;
    if (select count(*) from users where household_id = hh) >= cfg.max_members_per_household then
      raise exception 'family_full';
    end if;
  end if;

  insert into users (telegram_id, display_name, username, avatar_url, household_id)
  values (p_telegram_id, p_display_name, p_username, p_avatar_url, hh)
  returning * into u;

  update invites set used_by = u.id, used_at = now() where code = p_code;
  return u;
end $$;

-- Сколько мест занято — для экрана семьи и админа.
create or replace function access_info() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'users', (select count(*) from users),
    'max_users', (select max_users from app_config where id = 1),
    'members', (select count(*) from users where household_id = current_household()),
    'max_members', (select max_members_per_household from app_config where id = 1),
    'is_admin', coalesce((select is_admin from users where id = current_app_user()), false)
  )
$$;

revoke all on function create_invite_for(uuid, text) from public, anon, authenticated;
revoke all on function redeem_invite(text, bigint, text, text, text) from public, anon, authenticated;
revoke all on function create_invite(text) from public, anon;
revoke all on function access_info() from public, anon;
grant execute on function create_invite(text) to authenticated;
grant execute on function access_info() to authenticated;
grant execute on function create_invite_for(uuid, text) to service_role;
grant execute on function redeem_invite(text, bigint, text, text, text) to service_role;
