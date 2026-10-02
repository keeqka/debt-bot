-- Ссылки на «Выписку»: https://<мини-апп>/report/<токен>. Токен — случайные
-- 192 бита, ссылка живёт 5 минут и открывается без входа (её можно переслать
-- партнёру). Снимок html лежит в таблице только до конца срока, потом удаляется
-- кроном и при каждом обращении. Доступ только из Edge Functions (service role):
-- RLS включён, политик нет, права клиентским ролям сняты.
create table report_links (
  id text primary key check (id ~ '^[A-Za-z0-9_-]{32}$'),
  household_id uuid not null references households(id) on delete cascade,
  html text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index report_links_expires_at on report_links (expires_at);
alter table report_links enable row level security;
revoke all on report_links from anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('report-links-cleanup', '*/5 * * * *', 'delete from report_links where expires_at < now()');
  end if;
end $$;
