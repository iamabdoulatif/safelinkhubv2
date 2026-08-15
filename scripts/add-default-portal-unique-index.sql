-- Empêche le semis des portails livrés d'office d'insérer un doublon quand deux
-- lectures arrivent en même temps sur un compte neuf (page des modèles +
-- assistant d'auto-setup).
--
-- Index PARTIEL, volontairement : la base contient déjà des doublons légitimes
-- (org_id, name) produits par le bouton « dupliquer », qui nomme les copies
-- « … (copie) ». Un index global les rejetterait et casserait la duplication.
create unique index if not exists captive_templates_default_portal_uniq
  on captive_templates (org_id, name)
  where name in ('hotspot-sfh1', 'hotspot-sfh2');
