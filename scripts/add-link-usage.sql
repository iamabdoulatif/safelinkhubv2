-- Contrôle de consommation du lien montant (WAN) et par zone WiFi (VLAN).
--
-- ⚙️ APPLIQUÉE AUTOMATIQUEMENT au démarrage du conteneur (voir
-- src/lib/db/migrations.ts, entrée "0001_link_usage"). Ce fichier est le miroir
-- humain / l'application manuelle de secours — un test vérifie qu'il ne diverge
-- pas du SQL embarqué (src/lib/db/migrations.test.ts).
--
-- Colonnes nullables / à défaut → aucun risque pour l'existant.
alter table routers
  add column if not exists link_type text,
  add column if not exists wan_quota_mb integer,
  add column if not exists billing_cycle_day integer not null default 1,
  add column if not exists wan_throttle_kbps integer,
  add column if not exists wan_used_bytes bigint not null default 0,
  add column if not exists wan_last_raw bigint not null default 0,
  add column if not exists wan_cycle_started_at timestamp,
  add column if not exists wan_quota_alerted_at timestamp,
  add column if not exists wan_throttled_at timestamp;

alter table bridges
  add column if not exists zone_quota_mb integer,
  add column if not exists zone_cap_kbps integer,
  add column if not exists zone_used_bytes bigint not null default 0,
  add column if not exists zone_last_raw bigint not null default 0,
  add column if not exists zone_cycle_started_at timestamp;
