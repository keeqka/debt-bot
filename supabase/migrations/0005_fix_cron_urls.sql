-- 0002_cron.sql was applied with literal placeholder text (<PROJECT_REF>,
-- <CRON_SECRET>) since those values didn't exist yet at the time. Re-schedule
-- both jobs under the same names with the real values now that they do —
-- cron.schedule upserts by job name, so this replaces the broken definitions
-- in place rather than creating duplicates.

select cron.schedule(
  'weekly-summary',
  '0 14 * * 0', -- Sunday 19:00 Asia/Almaty (UTC+5) = 14:00 UTC
  $$
  select net.http_post(
    url := 'https://twdywvyyjfaiisbaitxl.supabase.co/functions/v1/cron-weekly-summary',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer cd5e366df4320158b02709e8de52cc0d157a80b5d617d3b4f9b8f68971f75e69'),
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'monthly-summary',
  '0 15 28-31 * *', -- 20:00 Asia/Almaty daily in that window; function itself checks "is this the last day of the month"
  $$
  select net.http_post(
    url := 'https://twdywvyyjfaiisbaitxl.supabase.co/functions/v1/cron-monthly-summary',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer cd5e366df4320158b02709e8de52cc0d157a80b5d617d3b4f9b8f68971f75e69'),
    body := '{}'::jsonb
  );
  $$
);
