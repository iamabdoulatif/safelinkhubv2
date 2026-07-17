-- Sélection host-par-host du walled-garden, par organisation. Tableau JSON des
-- dst-host de paiement que l'admin a EXPLICITEMENT décochés dans
-- Paramètres → Walled-garden. Vide ('[]') = tous les hôtes du catalogue sont
-- installés (comportement historique — la migration est donc rétro-compatible :
-- les orgs existantes gardent le walled-garden complet). L'app SafeLinkHub n'y
-- figure jamais : elle est toujours déployée. Voir src/lib/db/schema.ts
-- (organizations.walledGardenDisabledHosts), src/lib/mikrotik/walled-garden.ts
-- et src/lib/mikrotik/walled-garden-config.ts.
alter table organizations
  add column if not exists walled_garden_disabled_hosts jsonb not null default '[]'::jsonb;
