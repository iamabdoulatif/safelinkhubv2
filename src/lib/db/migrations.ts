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
  {
    // Garde-fou quota autonome : mémo du réglage posé sur le routeur
    // (script + scheduler + file de bridage). La vérité reste le routeur ;
    // ce mémo sert de repli hors ligne. Voir lib/mikrotik/quota-guard.ts.
    // Miroir : scripts/add-quota-guard.sql.
    id: "0005_router_quota_guard",
    sql: `
alter table routers
  add column if not exists quota_guard jsonb;
`.trim(),
  },
  {
    // Réglage de filtrage de contenu mémorisé par routeur (catégories +
    // options). La vérité reste le routeur — chaque entrée posée porte le
    // commentaire de sa catégorie — ; ce mémo est le repli hors ligne et le
    // seul endroit où survivent les options, sans trace attribuable sur la
    // box. Voir lib/mikrotik/content-filter-actions.ts.
    // Miroir : scripts/add-router-content-filter.sql.
    //
    // Cette colonne avait été livrée dans drizzle/0012 et appliquée À LA MAIN
    // en prod (10/09/2026) : elle n'existait dans aucune base neuve. Ici, elle
    // s'applique au démarrage comme les autres.
    id: "0006_router_content_filter",
    sql: `
alter table routers
  add column if not exists content_filter jsonb;
`.trim(),
  },
  {
    // Quota VPN scopé au routeur (surcharge celui de l'organisation ; null =
    // suit l'org) et plafond de VOLUME d'un forfait en Mo (null = illimité).
    // Miroir : scripts/add-router-vpn-quota-and-package-cap.sql.
    //
    // Même histoire que 0006 : livrées dans drizzle/0010 et 0011 le 10/09/2026
    // et appliquées à la main. Rattrapées ici pour qu'une base neuve les ait.
    id: "0007_router_vpn_quota_and_package_cap",
    sql: `
alter table routers
  add column if not exists vpn_quota_mode text,
  add column if not exists vpn_quota_expires_at timestamp;

alter table packages
  add column if not exists data_cap_mb integer;
`.trim(),
  },
  {
    // Débounce de la relance automatique du serveur hotspot par la veille du
    // portail (hotspot-portal-watch.ts). Miroir : scripts/add-router-portal-repaired-at.sql.
    id: "0008_router_portal_repaired_at",
    sql: `
alter table routers
  add column if not exists portal_repaired_at timestamp;
`.trim(),
  },
  {
    // Régulation du trafic pilotée par n8n : seuils édités à l'écran (lus par
    // le workflow) + état et journal écrits par le workflow. Voir
    // lib/mikrotik/regulation.ts. Miroir : scripts/add-router-regulation.sql.
    id: "0009_router_regulation",
    sql: `
create table if not exists router_regulation (
  router_id uuid primary key references routers(id) on delete cascade,
  enabled boolean not null default false,
  soft_cap_mb integer not null,
  hard_cap_mb integer not null,
  safety numeric(4,3) not null default 0.950,
  day_critical_ratio numeric(4,3) not null default 1.100,
  block_limit text not null default '64k/64k',
  abuse_threshold_mb integer not null default 1024,
  abuse_block_minutes integer not null default 180,
  abuse_max_offenses integer not null default 3,
  state jsonb,
  watch jsonb,
  updated_at timestamp not null default now()
);

create table if not exists router_regulation_events (
  id uuid primary key default gen_random_uuid(),
  router_id uuid not null references routers(id) on delete cascade,
  kind text not null,
  payload jsonb not null,
  created_at timestamp not null default now()
);

create index if not exists router_regulation_events_router_idx
  on router_regulation_events (router_id, created_at);
`.trim(),
  },
];
