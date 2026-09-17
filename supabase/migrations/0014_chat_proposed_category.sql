-- Lets the chat advisor propose a new category ("добавь категорию Подписки")
-- the same way it already proposes debts: shown in the bubble, actually
-- created only on tap — categories are low-risk enough not to need a full
-- form first, just a single confirm.

alter table chat_messages add column proposed_category jsonb;
