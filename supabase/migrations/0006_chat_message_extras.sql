-- Two additions to support: showing which model answered, and letting the
-- chat advisor propose creating a debt (always reviewed/confirmed in the
-- "Новый долг" form before it's actually saved — same pattern as receipts
-- and the screenshot-based debt assist, never an unconfirmed write).

alter table chat_messages add column model text;
alter table chat_messages add column proposed_debt jsonb;
