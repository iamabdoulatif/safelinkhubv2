-- Mémorise le dernier portail captif installé sur CHAQUE routeur.
--
-- Le lien routeur→portail n'existait que sur les bridges suivis
-- (bridges.captive_template_id), or la plupart des routeurs n'ont aucun bridge
-- suivi : le portail installé n'était donc mémorisé nulle part. Conséquence
-- concrète, constatée sur MAMBA et RUE-NICOLAS : une sauvegarde ne sait pas
-- quel portail réinstaller sur un rechange, qui sert alors la page de connexion
-- RouterOS par défaut — ni forfaits, ni paiement.
--
-- Les fichiers du portail vivent sur la flash du routeur (donc hors sauvegarde) :
-- cette colonne est le seul moyen de les reposer automatiquement.
--
-- Nullable + on delete set null : aucun risque pour l'existant (null = portail
-- inconnu, la restauration le signale au lieu d'en deviner un).
-- Voir src/lib/db/schema.ts (routers.captiveTemplateId),
-- src/lib/captive-templates/actions.ts (installTemplateOnRouter),
-- src/lib/mikrotik/router-backup.ts (readPortalInfo).
alter table routers
  add column if not exists captive_template_id uuid references captive_templates(id) on delete set null;

create index if not exists routers_captive_template_id_idx on routers (captive_template_id);
