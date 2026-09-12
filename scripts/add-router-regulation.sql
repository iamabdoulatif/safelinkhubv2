-- Miroir humain de la migration embarquée 0009_router_regulation (src/lib/db/migrations.ts).
-- Régulation du trafic pilotée par n8n : seuils + état + journal par routeur.
create table if not exists router_regulation (
  router_id uuid primary key references routers(id) on delete cascade,
  enabled boolean not null default false,
  soft_cap_mb integer not null,
  hard_cap_mb integer not null,
  safety numeric(4,3) not null default 0.950,
  day_critical_ratio numeric(4,3) not null default 1.100,
  block_limit text not null default '64k/64k',
  abuse_threshold_mb integer not null default 1024,
  abuse_block_minutes integer not null default 180,
  abuse_max_offenses integer not null default 3,
  state jsonb,
  watch jsonb,
  updated_at timestamp not null default now()
);

create table if not exists router_regulation_events (
  id uuid primary key default gen_random_uuid(),
  router_id uuid not null references routers(id) on delete cascade,
  kind text not null,
  payload jsonb not null,
  created_at timestamp not null default now()
);

create index if not exists router_regulation_events_router_idx
  on router_regulation_events (router_id, created_at);
