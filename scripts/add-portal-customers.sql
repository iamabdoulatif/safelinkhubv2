-- Fiche client du portail captif, renseignée à la PREMIÈRE commande d'un numéro
-- (prénom/nom/email demandés sur la page de paiement). Reliée aux commandes par
-- (org_id, phone). Miroir embarqué : migrations.ts 0027.
create table if not exists portal_customers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  phone text not null,
  first_name text not null,
  last_name text not null,
  email text not null,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now(),
  unique (org_id, phone)
);
