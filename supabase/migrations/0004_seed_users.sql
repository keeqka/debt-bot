-- Pre-create the requested custom nickname so it sticks from the very first
-- login. auth-telegram never overwrites an existing display_name, only
-- username/avatar_url — so this survives real logins. The other whitelisted
-- user (707973572) isn't seeded here and will get their real Telegram name
-- automatically on first login, same as any new user.
insert into users (telegram_id, display_name)
values (817686063, 'Ася')
on conflict (telegram_id) do nothing;
