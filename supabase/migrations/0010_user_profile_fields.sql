-- Hlow Flow redesign §2/§7: onboarding step 2 (income + payday) feeds
-- Overview's budget math, and the daily-reminder toggle (paid-tier feature,
-- landing Phase 8 — the free tier stub, no real payment yet). timezone
-- already existed (0001_init.sql, default Asia/Almaty) and is reused as-is.

alter table users add column monthly_income numeric(14, 2);
alter table users add column payday smallint check (payday between 1 and 31);
alter table users add column daily_reminder_enabled boolean not null default false;
alter table users add column daily_reminder_time time not null default '21:00';
alter table users add column vacation_paused boolean not null default false;
