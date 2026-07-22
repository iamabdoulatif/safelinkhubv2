-- Free, time-boxed access passes for promotions, referrals, rewards and
-- technical support. No price or Safecoin debit is associated with a pass.
CREATE TABLE IF NOT EXISTS remote_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  router_id uuid REFERENCES routers(id) ON DELETE CASCADE,
  services jsonb NOT NULL DEFAULT '[]'::jsonb,
  duration_key text NOT NULL,
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active',
  reason text NOT NULL,
  note text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  revoked_by uuid REFERENCES users(id) ON DELETE SET NULL,
  revoked_at timestamptz,
  revoke_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT remote_access_grants_window_valid CHECK (expires_at > starts_at)
);

CREATE INDEX IF NOT EXISTS remote_access_grants_org_status_expires_idx
  ON remote_access_grants(org_id, status, expires_at);
CREATE INDEX IF NOT EXISTS remote_access_grants_router_status_idx
  ON remote_access_grants(router_id, status);
