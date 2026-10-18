create table if not exists router_traffic_samples (
  id uuid primary key default gen_random_uuid(),
  router_id uuid not null references routers(id) on delete cascade,
  bucket timestamp not null,
  measured_at timestamp not null,
  payload jsonb not null
);
create unique index if not exists router_traffic_samples_bucket_idx on router_traffic_samples (router_id, bucket);
create index if not exists router_traffic_samples_measured_idx on router_traffic_samples (router_id, measured_at);
create table if not exists router_traffic_state (
  router_id uuid primary key references routers(id) on delete cascade,
  baseline jsonb,
  graphing jsonb,
  updated_at timestamp not null default now()
);
create table if not exists router_traffic_incidents (
  id uuid primary key default gen_random_uuid(),
  router_id uuid not null references routers(id) on delete cascade,
  link_id text not null,
  kind text not null check (kind in ('fup', 'restriction', 'outage')),
  source text not null check (source in ('safelinkhub', 'mikrotik', 'starlink')),
  certainty text not null check (certainty in ('confirmed', 'suspected')),
  evidence text not null,
  started_at timestamp not null,
  ended_at timestamp,
  recorded_by uuid references users(id) on delete set null,
  created_at timestamp not null default now(),
  check (ended_at is null or ended_at >= started_at)
);
create index if not exists router_traffic_incidents_router_idx on router_traffic_incidents (router_id, started_at);
