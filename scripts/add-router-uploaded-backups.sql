-- Fichiers .backup binaires RouterOS téléversés à la main, pour cloner un
-- routeur vers un autre (/system backup load) — distinct de router_backups, qui
-- est un snapshot LOGIQUE lu via l'API et rejouable ticket par ticket.
--
-- data = le binaire .backup encodé base64. On le garde en base plutôt qu'en
-- blob externe : le routeur cible doit pouvoir le tirer lui-même par /tool fetch
-- pendant la restauration, via une route tokenisée de l'app.
--
-- fetch_token_hash / fetch_token_expires_at : jeton éphémère (stocké haché) que
-- le routeur présente pour récupérer le binaire, sur le même modèle que
-- l'installation VPN. Il expire vite — le fichier n'est jamais servi en clair.
--
-- uploaded_by_email / uploaded_by_name sont un SNAPSHOT volontairement dupliqué :
-- le superadmin doit encore voir qui a téléversé même si le compte est parti.
-- Voir src/lib/db/schema.ts (routerUploadedBackups) +
-- src/lib/mikrotik/routeros-backup-file.ts (validation du format binaire).
create table if not exists router_uploaded_backups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  uploaded_by_email text,
  uploaded_by_name text,
  file_name text not null,
  size_bytes integer not null default 0,
  encrypted boolean not null default false,
  data text not null,
  fetch_token_hash text,
  fetch_token_expires_at timestamp,
  created_at timestamp not null default now()
);

create index if not exists router_uploaded_backups_org_id_idx on router_uploaded_backups (org_id);
create index if not exists router_uploaded_backups_created_at_idx on router_uploaded_backups (created_at);
