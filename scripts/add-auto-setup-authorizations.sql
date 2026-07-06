-- TEMPORAIRE — table de monétisation manuelle de l'Auto-Setup.
-- TODO: Remplacer par système de paiement intégré.
create table if not exists auto_setup_authorizations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  requester_email text not null,
  requester_name text not null,
  router_id uuid references routers(id) on delete cascade,
  router_name text,
  supports_containers boolean not null,
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

-- Recherche fréquente : les demandes en attente (dashboard superadmin) et la
-- garde qui cherche une autorisation approuvée non consommée par routeur.
create index if not exists auto_setup_auth_status_idx
  on auto_setup_authorizations (status);
create index if not exists auto_setup_auth_router_idx
  on auto_setup_authorizations (router_id, status);
