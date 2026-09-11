-- Réglage de filtrage de contenu mémorisé par routeur (catégories + options).
-- La vérité reste le routeur : chaque entrée posée porte le commentaire de sa
-- catégorie, et l'écran lit cet état réel. Cette colonne est le repli quand le
-- routeur ne répond pas, et le seul endroit où survivent les options
-- (mots-clés SNI, forçage DNS, listes publiques), sans trace attribuable sur
-- la box. Voir src/lib/mikrotik/content-filter-actions.ts.
-- Miroir de la migration 0006_router_content_filter (src/lib/db/migrations.ts).

alter table routers
  add column if not exists content_filter jsonb;
