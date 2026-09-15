-- Miroir humain de la migration embarquée 0010_router_dualwan_jobs (src/lib/db/migrations.ts).
-- Lancements du provisionnement dual WAN Starlink délégué à n8n.
create table if not exists router_dualwan_jobs (
  id uuid primary key default gen_random_uuid(),
  router_id uuid not null references routers(id) on delete cascade,
  request jsonb not null,
  status text not null default 'running',
  result jsonb,
  created_at timestamp not null default now(),
  finished_at timestamp
);

create index if not exists router_dualwan_jobs_router_idx
  on router_dualwan_jobs (router_id, created_at);
