-- Multi-routeurs pour les vouchers : un même code peut vivre sur plusieurs
-- MikroTik (zones WiFi) à la fois. Table de liaison — n'ajoute QUE cette table,
-- sans risque pour les données existantes. Voir src/lib/db/schema.ts
-- (voucherRouters) + src/lib/vouchers/actions.ts + reconcile.ts.
create table if not exists voucher_routers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  voucher_id uuid not null references vouchers(id) on delete cascade,
  router_id uuid not null references routers(id) on delete cascade,
  profile_name text,
  status text not null default 'PROVISIONED',
  created_at timestamp not null default now()
);

-- Un voucher au plus une fois par routeur.
create unique index if not exists voucher_routers_voucher_router_idx
  on voucher_routers (voucher_id, router_id);
