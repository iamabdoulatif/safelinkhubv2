-- Catégories de la boutique, gérées par le superadmin (add / rename / delete).
-- products.category référence ces libellés par texte (pas de FK).
create table if not exists product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  position integer not null default 0,
  created_at timestamp not null default now()
);

-- Amorçage avec le catalogue par défaut (idempotent).
insert into product_categories (name, position) values
  ('Routeurs', 0),
  ('Point-to-Point', 1),
  ('Antennes', 2),
  ('Switchs', 3),
  ('Outils réseau', 4),
  ('Outils PC', 5),
  ('Mac / macOS', 6),
  ('Apple Watch', 7),
  ('Périphériques', 8),
  ('Power banks & Énergie', 9),
  ('Onduleurs', 10),
  ('Caméras IP', 11),
  ('Appareils photo', 12),
  ('Accessoires', 13),
  ('Câbles', 14)
on conflict (name) do nothing;
