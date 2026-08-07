-- Restauration de sauvegarde suivie hors du cycle requête/réponse.
--
-- Pourquoi une table et pas un simple retour de Server Action : restaurer un gros
-- site recrée les tickets UN À UN (RouterOS n'a pas d'ajout en lot), soit
-- plusieurs minutes. Or safelinkhub.io passe par Cloudflare, qui coupe toute
-- réponse d'origine au-delà de ~100 s (524) — la requête synchrone était tuée en
-- plein vol. Le bouton crée donc cette ligne, lance le travail en fond (after())
-- et répond tout de suite ; l'UI sonde l'avancement par requêtes brèves.
--
-- backup_id / target_router_id sont ON DELETE SET NULL : le job reste comme
-- trace d'audit même si la sauvegarde ou le routeur cible disparaît ensuite.
--
-- updated_at sert de heartbeat : un « running » figé au-delà de ~2 min signifie
-- que le conteneur a redémarré en pleine restauration — l'UI le détecte comme
-- périmé et propose de relancer (l'opération est idempotente).
-- Voir src/lib/db/schema.ts (routerRestoreJobs).
create table if not exists router_restore_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  backup_id uuid references router_backups(id) on delete set null,
  target_router_id uuid references routers(id) on delete set null,
  status text not null default 'running',
  progress jsonb,
  error text,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now(),
  finished_at timestamp
);

create index if not exists router_restore_jobs_org_id_idx on router_restore_jobs (org_id);
create index if not exists router_restore_jobs_target_idx on router_restore_jobs (target_router_id);
create index if not exists router_restore_jobs_status_idx on router_restore_jobs (status);
