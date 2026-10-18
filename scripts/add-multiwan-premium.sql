create table if not exists router_multiwan_licenses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  router_id uuid not null references routers(id) on delete cascade,
  purchased_by uuid references users(id) on delete set null,
  amount_fcfa integer not null check (amount_fcfa > 0),
  payment_source text not null check (payment_source in ('wallet', 'safecoin')),
  sc_cents integer,
  rate_fcfa_per_sc integer,
  payment_reference text not null unique,
  config jsonb,
  generated_at timestamp,
  purchased_at timestamp not null default now(),
  unique (org_id, router_id)
);
