-- Porte d'autorisation manuelle générique (router_link + remote_access).
-- Idempotent. Voir src/lib/db/schema.ts (featureAccessAuthorizations) et
-- src/lib/billing/feature-access-*.ts.
create table if not exists feature_access_authorizations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  requester_email text not null,
  requester_name text not null,
  feature text not null,
  note text,
  status text not null default 'pending',
  consumed_at timestamp,
  decided_at timestamp,
  decided_by uuid references users(id) on delete set null,
  admin_note text,
  created_at timestamp not null default now()
);

-- Recherche fréquente : autorisation utilisable (org + feature + status + non consommée).
create index if not exists feature_access_authorizations_gate_idx
  on feature_access_authorizations (org_id, feature, status);
create index if not exists feature_access_authorizations_pending_idx
  on feature_access_authorizations (status, created_at);
