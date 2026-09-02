-- Débit individuel par client d'une zone WiFi (PCQ) — plafonne CHAQUE client à
-- l'intérieur du VLAN, en plus du plafond agrégé zone_cap_kbps.
--
-- ⚙️ APPLIQUÉE AUTOMATIQUEMENT au démarrage du conteneur (voir
-- src/lib/db/migrations.ts, entrée "0002_zone_per_client"). Ce fichier est le
-- miroir humain — un test vérifie qu'il ne diverge pas du SQL embarqué.
alter table bridges
  add column if not exists zone_per_client_kbps integer;
