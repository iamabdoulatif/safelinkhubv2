-- Mémoire durable d'un appareil par compte roaming et état par zone.
-- Additif et réexécutable : aucune donnée existante n'est modifiée.
create table if not exists roaming_device_bindings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  voucher_id uuid not null references vouchers(id) on delete cascade,
  mac_address text not null,
  bound_at timestamp not null default now(),
  updated_at timestamp not null default now(),
  revoked_at timestamp,
  unique (voucher_id)
);

create table if not exists roaming_device_binding_routers (
  id uuid primary key default gen_random_uuid(),
  binding_id uuid not null references roaming_device_bindings(id) on delete cascade,
  router_id uuid not null references routers(id) on delete cascade,
  status text not null default 'PENDING',
  attempts integer not null default 0,
  last_error text,
  last_attempt_at timestamp,
  synced_at timestamp,
  unique (binding_id, router_id),
  check (status in ('PENDING', 'SYNCED', 'ERROR'))
);

create index if not exists roaming_device_bindings_org_voucher_idx
  on roaming_device_bindings (org_id, voucher_id);
create index if not exists roaming_device_binding_routers_router_status_idx
  on roaming_device_binding_routers (router_id, status);
