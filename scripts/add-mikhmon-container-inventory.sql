-- Miroir de la migration 0023_mikhmon_container_inventory (src/lib/db/migrations.ts).
-- Le registre embarqué s'applique tout seul au démarrage ; ce fichier n'est là
-- que pour l'appliquer à la main sur une base qui n'a pas redémarré.
--
-- Inventaire du conteneur MikHmon, relevé à chaque synchro de routeur.
-- `mikhmon_image` garde l'image BRUTE : la classification v3/v7 se fait à la
-- lecture, pas à l'écriture.

alter table routers add column if not exists mikhmon_image text;
alter table routers add column if not exists mikhmon_root_dir text;
alter table routers add column if not exists mikhmon_container_running boolean;
alter table routers add column if not exists mikhmon_seen_at timestamp;

-- Répartition du parc une fois les synchros passées (~5 min) :
--
--   select
--     case
--       when mikhmon_seen_at is null then 'jamais relevé'
--       when mikhmon_image is null or mikhmon_image = '' then 'sans conteneur'
--       when mikhmon_image ~* 'mikhmon-v7' then 'v7'
--       else 'autre génération (v3…)'
--     end as generation,
--     count(*)
--   from routers
--   group by 1
--   order by 2 desc;
