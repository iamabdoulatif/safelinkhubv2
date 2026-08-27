-- Quelle édition de MikHmon tourne dans chaque instance cloud.
--
-- Additive et avec défaut : les lignes existantes prennent « v7 », qui est la
-- vérité — c'était la seule édition disponible quand elles ont été créées.
-- À appliquer AVANT le déploiement (le code lit la colonne).
ALTER TABLE "router_mikhmon_cloud_instances"
  ADD COLUMN IF NOT EXISTS "edition" text NOT NULL DEFAULT 'v7';
