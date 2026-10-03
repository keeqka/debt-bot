-- Лимит людей в приложении: было 5, стало 10 (app_config.max_users; в семье по-прежнему не больше max_members_per_household).
alter table app_config alter column max_users set default 10;
update app_config set max_users = 10 where id = 1;
