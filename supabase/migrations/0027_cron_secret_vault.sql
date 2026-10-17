-- Секрет расписаний (CRON_SECRET) больше не хранится в миграциях и в cron.job.
-- Раньше он был зашит в тело задач (0005, 0013, 0024) — а репозиторий публичный.
-- Теперь значение лежит в Supabase Vault под именем 'cron_secret', а задачи вызывают
-- функцию cron_call(), которая читает его в момент запуска.
--
-- ⚠️ ПЕРЕД применением создай секрет в SQL Editor (значение в репозиторий не попадает):
--
--   select vault.create_secret('<НОВЫЙ_СЕКРЕТ>', 'cron_secret');
--
-- Сменить позже:
--
--   select vault.update_secret((select id from vault.secrets where name = 'cron_secret'), '<НОВЫЙ_СЕКРЕТ>');
--
-- Значение должно совпадать с GitHub-секретом CRON_SECRET (deploy-backend кладёт его в секреты
-- Edge Functions) и с secret_token вебхука бота. Если в Vault секрета нет, cron_call пропускает
-- вызов с предупреждением в логах — задачи не падают, но и ничего не делают.

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault;

create or replace function cron_call(fn text) returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  secret text;
begin
  select decrypted_secret into secret
    from vault.decrypted_secrets
   where name = 'cron_secret'
   order by created_at desc
   limit 1;

  if secret is null then
    raise warning 'cron_call(%): в Vault нет секрета cron_secret — вызов пропущен', fn;
    return;
  end if;

  perform net.http_post(
    url := 'https://twdywvyyjfaiisbaitxl.supabase.co/functions/v1/' || fn,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || secret),
    body := '{}'::jsonb
  );
end;
$$;

-- Читать секрет и дёргать функции могут только pg_cron (роль postgres) и владелец, не клиентские роли.
revoke all on function cron_call(text) from public, anon, authenticated;

-- cron.schedule перезаписывает задачу с тем же именем — расписания прежние, меняется только тело.
select cron.schedule('weekly-summary', '0 14 * * *', $$select cron_call('cron-weekly-summary')$$);        -- каждый день 19:00 Asia/Almaty; функция сама выбирает тех, у кого сегодня день разбора
select cron.schedule('monthly-summary', '0 15 28-31 * *', $$select cron_call('cron-monthly-summary')$$);  -- 20:00 Asia/Almaty в конце месяца; функция сама проверяет «последний ли это день»
select cron.schedule('daily-reminder', '0 * * * *', $$select cron_call('cron-daily-reminder')$$);         -- каждый час; функция сама сверяет местный час пользователя
