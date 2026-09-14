-- ТЗ §9: pg_cron schedules that call the weekly/monthly summary Edge Functions.
--
-- ⚠️ Placeholders below (<PROJECT_REF>, <CRON_SECRET>) must be filled in AFTER
-- the project is created and `supabase functions deploy` has run — this
-- migration can't know those values yet. Either edit this file and re-run it,
-- or paste the two `select cron.schedule(...)` statements into the Supabase
-- SQL editor once the real values are known. <CRON_SECRET> must match the
-- CRON_SECRET function secret (see supabase/functions/_shared/env.ts) so the
-- functions can reject calls that don't come from pg_cron.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'weekly-summary',
  '0 19 * * 0', -- Sunday 19:00 UTC — adjust to Asia/Almaty (UTC+5) offset: '0 14 * * 0'
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/cron-weekly-summary',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <CRON_SECRET>'),
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'monthly-summary',
  '0 20 28-31 * *', -- fires daily in that window; the function itself checks "is this the last day of the month"
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/cron-monthly-summary',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <CRON_SECRET>'),
    body := '{}'::jsonb
  );
  $$
);
