ALTER TABLE router_regulation ADD COLUMN IF NOT EXISTS fup_links jsonb;
ALTER TABLE router_regulation ADD COLUMN IF NOT EXISTS fup_ledger jsonb;
ALTER TABLE router_regulation ADD COLUMN IF NOT EXISTS fup_observation jsonb;
ALTER TABLE router_regulation ADD COLUMN IF NOT EXISTS fup_mode text NOT NULL DEFAULT 'observation';
ALTER TABLE router_regulation ADD COLUMN IF NOT EXISTS fup_runtime jsonb;
