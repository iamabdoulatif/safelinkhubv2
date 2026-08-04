-- Rétention : ne garder que les 2 sauvegardes les plus récentes de CHAQUE routeur.
-- Les sauvegardes orphelines (router_id IS NULL = routeur supprimé) sont
-- PRÉSERVÉES : elles survivent volontairement à la suppression du routeur et
-- sont justement le cas où elles servent (voir schema.ts routerBackups).
-- Idempotent : réexécutable sans risque (ne supprime que ce qui dépasse 2).
DELETE FROM router_backups b
USING (
  SELECT id,
         row_number() OVER (
           PARTITION BY router_id
           ORDER BY created_at DESC, id DESC
         ) AS rn
  FROM router_backups
  WHERE router_id IS NOT NULL
) ranked
WHERE b.id = ranked.id
  AND ranked.rn > 2
