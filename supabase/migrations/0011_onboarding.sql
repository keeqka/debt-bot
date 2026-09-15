-- Hlow Flow redesign §2: 3-step onboarding (first receipt -> income/payday ->
-- debts), all steps skippable except the first. Gates whether AppShell shows
-- the onboarding overlay instead of the normal 4 tabs.

alter table users add column onboarding_completed_at timestamptz;
