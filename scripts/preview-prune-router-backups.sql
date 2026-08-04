-- APERÇU (lecture seule) : ce qui serait supprimé par prune-router-backups-keep-2.sql.
-- Par routeur : total de sauvegardes, nombre gardé (max 2), nombre à supprimer.
SELECT router_name,
       count(*)                        AS total,
       least(count(*), 2)              AS gardees,
       greatest(count(*) - 2, 0)       AS a_supprimer
FROM router_backups
WHERE router_id IS NOT NULL
GROUP BY router_id, router_name
ORDER BY a_supprimer DESC, router_name;
