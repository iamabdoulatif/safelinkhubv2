-- Safecoin is an internal service credit. This migration is intentionally
-- idempotent so it can be applied during a rolling deployment.
CREATE TABLE IF NOT EXISTS safecoin_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_fcfa_per_sc integer NOT NULL DEFAULT 100,
  recharge_fee_sc_cents integer NOT NULL DEFAULT 0,
  vpn_fee_sc_cents integer NOT NULL DEFAULT 0,
  auto_setup_fee_sc_cents integer NOT NULL DEFAULT 0,
  version integer NOT NULL DEFAULT 1,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT safecoin_settings_rate_positive CHECK (rate_fcfa_per_sc > 0),
  CONSTRAINT safecoin_settings_fees_nonnegative CHECK (
    recharge_fee_sc_cents >= 0 AND vpn_fee_sc_cents >= 0 AND auto_setup_fee_sc_cents >= 0
  )
);

CREATE TABLE IF NOT EXISTS safecoin_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  balance_sc_cents integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT safecoin_accounts_balance_nonnegative CHECK (balance_sc_cents >= 0)
);

CREATE TABLE IF NOT EXISTS safecoin_fee_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service text NOT NULL,
  amount_sc_cents integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT safecoin_fee_rules_amount_nonnegative CHECK (amount_sc_cents >= 0)
);

CREATE TABLE IF NOT EXISTS safecoin_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES safecoin_accounts(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entry_type text NOT NULL,
  amount_sc_cents integer NOT NULL,
  reference_fcfa_cents integer,
  status text NOT NULL DEFAULT 'completed',
  idempotency_key text NOT NULL,
  reference_type text,
  reference_id text,
  note text,
  payment_reference text,
  payment_method text,
  country_iso2 text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT safecoin_ledger_idempotency_key_unique UNIQUE (idempotency_key),
  CONSTRAINT safecoin_ledger_amount_nonzero CHECK (amount_sc_cents <> 0)
);

CREATE INDEX IF NOT EXISTS safecoin_ledger_org_created_idx
  ON safecoin_ledger(org_id, created_at);
CREATE INDEX IF NOT EXISTS safecoin_ledger_reference_idx
  ON safecoin_ledger(reference_type, reference_id);

INSERT INTO safecoin_settings (rate_fcfa_per_sc)
SELECT 100
WHERE NOT EXISTS (SELECT 1 FROM safecoin_settings);
