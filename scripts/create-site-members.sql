-- RBAC par site : restreint un membre à certains sites. Aucune ligne pour un
-- membre = non restreint (voit tout le parc de l'org).
-- Miroir de la migration embarquée 0030_site_members.
create table if not exists site_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  site_id uuid not null references sites(id) on delete cascade,
  created_at timestamp not null default now()
);
create unique index if not exists site_members_user_site_idx on site_members (user_id, site_id);
create index if not exists site_members_org_user_idx on site_members (org_id, user_id);
