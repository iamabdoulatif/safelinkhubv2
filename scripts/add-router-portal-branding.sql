-- Branding du portail captif scopé au routeur (saisi dans l'auto-setup) :
-- contact support/paiement + espaces vendeurs. Colonnes nullables → aucun
-- risque pour l'existant (null = repli sur le branding du modèle de portail).
-- Voir src/lib/db/schema.ts (routers.portal*) + container-setup.ts (persist) +
-- src/app/api/router/v1/[slug]/captive-template/[templateId]/route.ts (rendu).
alter table routers
  add column if not exists portal_support_whatsapp text,
  add column if not exists portal_support_phone text,
  add column if not exists portal_vendors jsonb;
