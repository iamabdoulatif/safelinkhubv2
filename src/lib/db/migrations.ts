/**
 * Migrations de schéma appliquées AU DÉMARRAGE du serveur (voir
 * src/instrumentation.ts → src/lib/db/migrate.ts).
 *
 * Pourquoi ici, et pas un fichier .sql lu sur le disque : l'image Docker est un
 * build Next « standalone » qui ne copie PAS scripts/*.sql. Le SQL doit donc
 * voyager DANS le bundle — d'où ces chaînes. Chaque entrée est rejouée au plus
 * une fois par base (table de suivi `_slh_migrations`), et le SQL lui-même est
 * idempotent (`add column if not exists`) : rejouable sans risque.
 *
 * RÈGLE : on n'édite jamais une migration déjà publiée (son id est « consommé »
 * sur les bases de prod). Un changement = une NOUVELLE entrée à la fin.
 *
 * Le miroir humain de chaque entrée vit dans scripts/*.sql (documentation +
 * application manuelle de secours). Un test vérifie que les deux ne divergent
 * pas (migrations.test.ts).
 */
export type Migration = { id: string; sql: string };

export const MIGRATIONS: Migration[] = [
  {
    // Contrôle de consommation : type de lien (fibre/starlink) + quota total du
    // WAN + quota/débit par zone VLAN. Miroir : scripts/add-link-usage.sql.
    id: "0001_link_usage",
    sql: `
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
`.trim(),
  },
  {
    // Débit individuel par client de zone (PCQ). Miroir : scripts/add-zone-per-client.sql.
    id: "0002_zone_per_client",
    sql: `
alter table bridges
  add column if not exists zone_per_client_kbps integer;
`.trim(),
  },
  {
    // MAC précédemment liées à un compte roaming, à effacer plus tard.
    // Miroir : scripts/add-roaming-previous-macs.sql.
    id: "0003_roaming_previous_macs",
    sql: `
create table if not exists roaming_device_bindings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  voucher_id uuid not null references vouchers(id) on delete cascade,
  mac_address text not null,
  bound_at timestamp not null default now(),
  updated_at timestamp not null default now(),
  revoked_at timestamp,
  unique (voucher_id)
);

create table if not exists roaming_device_binding_routers (
  id uuid primary key default gen_random_uuid(),
  binding_id uuid not null references roaming_device_bindings(id) on delete cascade,
  router_id uuid not null references routers(id) on delete cascade,
  status text not null default 'PENDING',
  attempts integer not null default 0,
  last_error text,
  last_attempt_at timestamp,
  synced_at timestamp,
  unique (binding_id, router_id),
  check (status in ('PENDING', 'SYNCED', 'ERROR'))
);

create index if not exists roaming_device_bindings_org_voucher_idx
  on roaming_device_bindings (org_id, voucher_id);
create index if not exists roaming_device_binding_routers_router_status_idx
  on roaming_device_binding_routers (router_id, status);

alter table roaming_device_bindings
  add column if not exists previous_macs text[] not null default '{}';
`.trim(),
  },
  {
    // Localisation physique d'une zone (routeur).
    // Miroir : scripts/add-router-location.sql.
    id: "0004_router_location",
    sql: `
alter table routers
  add column if not exists latitude numeric(9,6),
  add column if not exists longitude numeric(9,6),
  add column if not exists location_street text,
  add column if not exists location_neighbourhood text,
  add column if not exists location_commune text,
  add column if not exists location_country text;
`.trim(),
  },
];
