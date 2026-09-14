-- Bank statement import (multiple transactions from one PDF/screenshot,
-- reviewed and confirmed in bulk — see statement-parse Edge Function).
alter type expense_source add value if not exists 'statement';
