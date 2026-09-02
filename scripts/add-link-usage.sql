-- Contrôle de consommation du lien montant (WAN) et par zone WiFi (VLAN).
-- Colonnes nullables / à défaut → aucun risque pour l'existant (null = pas de
-- quota, accumulateurs à 0). Voir src/lib/db/schema.ts (routers.link*/wan*,
-- bridges.zone*) + src/lib/mikrotik/link-usage.ts.
--
-- ⚠️ À APPLIQUER SUR LA BASE DE PROD AVANT DE DÉPLOYER : sans ces colonnes, une
-- lecture de `routers`/`bridges` échoue (« column does not exist ») car le SaaS
-- sélectionne des colonnes explicites depuis schema.ts.
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
