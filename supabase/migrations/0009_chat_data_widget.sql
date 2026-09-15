-- Hlow Flow redesign §6: numeric breakdowns render as a data card on paper
-- inside the chat bubble instead of text with percentages, and 2-3 quick
-- reply suggestions appear under the last bot message. Same
-- confirm-before-write posture as everything else here — these are purely
-- display data, nothing is written to expenses/incomes from them.

alter table chat_messages add column data_widget jsonb;
alter table chat_messages add column quick_replies text[];
