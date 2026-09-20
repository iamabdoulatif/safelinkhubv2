-- Miroir humain de la migration embarquée 0011_regulation_profile_throttle (src/lib/db/migrations.ts).
-- Bridage des profils hotspot pendant un freinage : % du débit de chaque forfait conservé (0 = désactivé).
alter table router_regulation
  add column if not exists profile_throttle_pct integer not null default 0;
