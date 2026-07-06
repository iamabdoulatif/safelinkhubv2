-- Phase 2 boutique : fiche produit (slug), galerie (images), badges
-- marketing configurables, et caractéristiques techniques (specs).
alter table products add column if not exists slug text;
alter table products add column if not exists images jsonb not null default '[]'::jsonb;
alter table products add column if not exists badges jsonb not null default '[]'::jsonb;
alter table products add column if not exists specs jsonb not null default '[]'::jsonb;

-- Unicité du slug (plusieurs NULL autorisés tant que non backfillé).
create unique index if not exists products_slug_key on products (slug) where slug is not null;
