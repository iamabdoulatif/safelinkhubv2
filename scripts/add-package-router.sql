-- Rattache chaque forfait à un MikroTik : les forfaits deviennent scopés par
-- routeur (auto-setup + portail captif ne mélangent plus les zones WiFi).
-- Colonne nullable → aucun risque pour les lignes existantes (routerId=null =
-- forfait legacy, adopté au prochain auto-setup du routeur). onDelete cascade :
-- supprimer un routeur retire ses forfaits rattachés (les legacy null restent).
-- Voir src/lib/db/schema.ts (packages.routerId) + container-setup.ts (sync) +
-- src/app/api/router/v1/[slug]/captive-template/[templateId]/route.ts.
alter table packages
  add column if not exists router_id uuid references routers(id) on delete cascade;

create index if not exists packages_router_id_idx on packages (router_id);
