-- Rattache un routeur à un site (nullable : « non rangé » reste valide).
-- set null à la suppression du site → jamais d'orphelin.
-- Miroir de la migration embarquée 0029_routers_site_id.
alter table routers add column if not exists site_id uuid references sites(id) on delete set null;
