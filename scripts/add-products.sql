-- Boutique e-commerce (équipement technologique), gérée par le superadmin.
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price_fcfa integer not null,
  stock_quantity integer not null default 0,
  image_url text,
  colors jsonb not null default '[]'::jsonb,
  category text,
  brand text,
  status text not null default 'active',
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

-- Catalogue : on liste surtout les produits actifs, récents d'abord.
create index if not exists products_status_idx on products (status);
