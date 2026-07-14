-- Run once before adding the unique index. It keeps the newest saved bridge
-- for every router/name pair, including the duplicate shown in the router UI.
DELETE FROM bridges AS duplicate
USING (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY router_id, name
      ORDER BY created_at DESC, id DESC
    ) AS position
  FROM bridges
) AS ranked
WHERE duplicate.id = ranked.id
  AND ranked.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS bridges_router_name_idx
  ON bridges (router_id, name);
