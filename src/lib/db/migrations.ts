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
];
