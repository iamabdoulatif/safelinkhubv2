-- Reprise sécurisée des accès distants : additive et idempotente.
create table if not exists router_replacements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  source_router_id uuid not null references routers(id) on delete cascade,
  replacement_router_id uuid not null references routers(id) on delete cascade,
  requested_by uuid references users(id) on delete set null,
  status text not null default 'pending',
  error text,
  created_at timestamp not null default now(),
  completed_at timestamp,
  cancelled_at timestamp
);

create index if not exists router_replacements_org_created_idx
  on router_replacements (org_id, created_at desc);
create index if not exists router_replacements_replacement_idx
  on router_replacements (replacement_router_id);
create unique index if not exists router_replacements_active_source_idx
  on router_replacements (source_router_id)
  where status in ('pending', 'installing', 'failed');

create table if not exists vpn_access_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references users(id) on delete set null,
  org_id uuid not null references organizations(id) on delete cascade,
  router_id uuid not null references routers(id) on delete cascade,
  replacement_id uuid references router_replacements(id) on delete set null,
  action text not null,
  created_at timestamp not null default now()
);

create index if not exists vpn_access_audit_events_router_created_idx
  on vpn_access_audit_events (router_id, created_at desc);
