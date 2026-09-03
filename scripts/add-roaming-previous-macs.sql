-- Liaisons d'appareil du roaming + mémoire des MAC précédemment liées.
--
-- Les deux tables n'ont jamais été enregistrées comme migration (elles ont été
-- posées à la main) : on les recrée ici en « if not exists » pour qu'aucune base
-- ne casse sur l'ALTER qui suit. previous_macs garde les MAC dont le compagnon
-- `name=<MAC>` n'a pas pu être retiré (zone injoignable au changement
-- d'appareil) : sans cette trace, la révocation du compte ne saurait plus quel
-- compagnon effacer et l'ancienne adresse continuerait à s'auto-loguer.
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

alter table roaming_device_bindings
  add column if not exists previous_macs text[] not null default '{}';
