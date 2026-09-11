-- Quota VPN scopé au routeur : surcharge celui de l'organisation. null = « ce
-- routeur suit son org », soit le comportement historique du parc.
--
-- Plafond de VOLUME d'un forfait, en Mo. null = pas de plafond. Posé sur
-- chaque compte à sa création via `=limit-bytes-total=`, pas sur le profil
-- hotspot (RouterOS ne sait pas le faire à ce niveau).
--
-- Miroir de la migration 0007_router_vpn_quota_and_package_cap
-- (src/lib/db/migrations.ts). Reprend drizzle/0010 et drizzle/0011.

alter table routers
  add column if not exists vpn_quota_mode text,
  add column if not exists vpn_quota_expires_at timestamp;

alter table packages
  add column if not exists data_cap_mb integer;
