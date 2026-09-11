-- Garde-fou quota autonome : mémo du réglage posé SUR le routeur
-- (script + scheduler + file de bridage, identifiés par « safelinkhub-quota-guard »).
-- La vérité reste le routeur ; cette colonne est le repli quand il ne répond
-- pas, et la référence du pourcentage consommé affiché à l'écran.
-- Voir src/lib/mikrotik/quota-guard.ts.
-- Miroir de la migration 0005_router_quota_guard (src/lib/db/migrations.ts).

alter table routers
  add column if not exists quota_guard jsonb;
