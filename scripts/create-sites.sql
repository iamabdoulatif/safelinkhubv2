-- Sites (agences/succursales) : regroupement de routeurs à l'intérieur d'une
-- org. Fondation de l'offre entreprise. `code` unique par org.
-- Miroir de la migration embarquée 0028_sites.
create table if not exists sites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  code text not null,
  location_commune text,
  location_country text,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  active boolean not null default true,
  created_at timestamp not null default now()
);
create unique index if not exists sites_org_code_idx on sites (org_id, code);
create index if not exists sites_org_created_idx on sites (org_id, created_at);
