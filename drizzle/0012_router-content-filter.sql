-- Réglage de filtrage de contenu mémorisé par routeur (catégories + options).
--
-- La vérité reste le ROUTEUR : depuis la découpe par catégorie, chaque entrée
-- posée porte le commentaire « safelinkhub-content-filter <catégorie> », et
-- l'écran lit cet état réel. Cette colonne ne sert que quand le routeur ne
-- répond pas (rouvrir l'écran sur le bon réglage plutôt que sur le défaut) et
-- pour les options — mots-clés SNI, forçage DNS, listes publiques — qui ne
-- laissent aucune trace attribuable sur le routeur.
--
-- Nullable et sans défaut À DESSEIN : null = « jamais réglé », soit le
-- comportement de tout le parc existant (l'écran retombe sur ses défauts).
-- À appliquer AVANT le déploiement (le code lit la colonne).
ALTER TABLE "routers"
  ADD COLUMN IF NOT EXISTS "content_filter" jsonb;
