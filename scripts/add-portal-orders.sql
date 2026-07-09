-- Commandes du portail captif public (achat forfait WiFi payé via GeniusPay
-- par-org). À la réussite du paiement : user hotspot lié au MAC + code SMS.
-- Voir src/lib/db/schema.ts (portalOrders) et src/lib/portal/fulfill.ts.
create table if not exists portal_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  router_id uuid not null references routers(id) on delete cascade,
  package_id uuid references packages(id) on delete set null,
  phone text not null,
  mac text not null,
  profile_name text,
  price_cents integer,
  status text not null default 'pending',
  payment_reference text,
  voucher_id uuid references vouchers(id) on delete set null,
  failure_reason text,
  created_at timestamp not null default now(),
  fulfilled_at timestamp
);

-- Le webhook retrouve la commande par la référence de paiement GeniusPay.
create index if not exists portal_orders_payment_reference_idx
  on portal_orders (payment_reference);
create index if not exists portal_orders_status_idx
  on portal_orders (status);
