-- TEMPORAIRE — table de monétisation manuelle des accès distants (VPN/forwards).
-- TODO: Remplacer par système de paiement intégré.
create table if not exists remote_access_authorizations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  requester_email text not null,
  requester_name text not null,
  router_id uuid references routers(id) on delete cascade,
  router_name text,
  service text not null,
  billing_period text not null,
  amount_fcfa integer not null,
  payment_method text not null,
  proof_url text,
  status text not null default 'pending',
  consumed_at timestamp,
  decided_at timestamp,
  decided_by uuid references users(id) on delete set null,
  admin_note text,
  created_at timestamp not null default now()
);

create index if not exists remote_access_auth_status_idx
  on remote_access_authorizations (status);
-- La garde cherche une autorisation approuvée non consommée par
-- (routeur, service).
create index if not exists remote_access_auth_router_service_idx
  on remote_access_authorizations (router_id, service, status);
