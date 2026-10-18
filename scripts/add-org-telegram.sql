create table if not exists org_telegram_settings (
  org_id uuid primary key references organizations(id) on delete cascade,
  bot_id text not null unique,
  bot_name text not null,
  bot_username text not null,
  token_encrypted text not null,
  revision uuid not null default gen_random_uuid(),
  pending jsonb,
  chat_id text,
  chat_label text,
  tested_at timestamp,
  enabled boolean not null default false,
  preferences jsonb not null default '{}',
  router_ids jsonb not null default '[]',
  activated_at timestamp,
  last_call_at timestamp,
  last_processed_at timestamp,
  last_error text,
  updated_at timestamp not null default now()
);
create table if not exists org_telegram_deliveries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  revision uuid not null,
  router_id uuid not null references routers(id) on delete cascade,
  event_key text not null,
  text text not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  next_attempt_at timestamp not null default now(),
  last_error text,
  created_at timestamp not null default now(),
  sent_at timestamp,
  unique (org_id, event_key)
);
create index if not exists org_telegram_deliveries_pending_idx on org_telegram_deliveries (status, next_attempt_at);
