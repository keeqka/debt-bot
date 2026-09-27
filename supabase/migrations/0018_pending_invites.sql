-- Приглашение, которое человек уже «принял» в боте (/start inv_<code>), но
-- ещё не использовал: приложение могли открыть не кнопкой из сообщения бота
-- (где код передаётся), а кнопкой меню или из списка чатов — тогда код до
-- auth-telegram не доходил, и приглашённый видел «доступ по приглашениям».
-- Бот запоминает код за Telegram ID, auth-telegram берёт его отсюда, если
-- код не пришёл с самим запуском.
create table pending_invites (
  telegram_id bigint primary key,
  code text not null references invites(code) on delete cascade,
  created_at timestamptz not null default now()
);

alter table pending_invites enable row level security; -- только сервер (service role)
