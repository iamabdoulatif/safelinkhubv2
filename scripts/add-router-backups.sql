-- Sauvegardes MikroTik : snapshot lu via l'API RouterOS, conservé pour
-- reconstruire un routeur de rechange sans perdre les tickets déjà vendus.
--
-- router_id est ON DELETE SET NULL (et NON cascade) : c'est le cœur de la
-- fonctionnalité — un routeur qui meurt est retiré du parc, et ses sauvegardes
-- doivent SURVIVRE pour être restaurées sur son remplaçant. D'où la duplication
-- de router_name / model / serial_number, seule trace du routeur disparu.
--
-- payload = JSON du snapshot, gzippé puis base64 (~100 Ko pour 4 800 tickets).
-- Voir src/lib/db/schema.ts (routerBackups) + src/lib/mikrotik/router-backup.ts.
create table if not exists router_backups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  router_id uuid references routers(id) on delete set null,
  router_name text not null,
  model text,
  ros_version text,
  serial_number text,
  identity text,
  trigger text not null default 'manual',
  payload text not null,
  size_bytes integer not null default 0,
  counts jsonb,
  created_at timestamp not null default now()
);

create index if not exists router_backups_router_id_idx on router_backups (router_id);
create index if not exists router_backups_org_id_idx on router_backups (org_id);
create index if not exists router_backups_created_at_idx on router_backups (created_at);
