-- Hlow Flow redesign §9: hourly trigger for the per-user daily reminder.
-- Unlike weekly/monthly summary (0002_cron.sql, one fixed broadcast time),
-- each user picks their own daily_reminder_time — pg_cron has no per-row
-- schedule, so this fires every hour and cron-daily-reminder/index.ts
-- itself filters for whoever's local hour matches right now.
--
-- ⚠️ Same placeholders as 0002_cron.sql (<PROJECT_REF>, <CRON_SECRET>) —
-- fill in after `supabase functions deploy`, or paste the statement below
-- into the Supabase SQL editor once those values are known.

select cron.schedule(
  'daily-reminder',
  '0 * * * *', -- every hour, on the hour (UTC) — the function itself matches each user's local hour
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/cron-daily-reminder',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <CRON_SECRET>'),
    body := '{}'::jsonb
  );
  $$
);
