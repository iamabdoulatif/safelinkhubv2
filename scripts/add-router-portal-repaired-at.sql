-- Dernière relance AUTOMATIQUE du serveur hotspot par la veille du portail
-- (src/lib/mikrotik/hotspot-portal-watch.ts). Sert de débounce : une relance
-- au plus toutes les six heures par routeur.
-- Miroir de la migration 0008_router_portal_repaired_at (src/lib/db/migrations.ts).

alter table routers
  add column if not exists portal_repaired_at timestamp;
