-- Récupération des honneurs de commande orphelins : `claimed_at` horodate le
-- claim paid→fulfilling. Un claim plus vieux que quelques minutes (crash ou
-- throw pendant l'honneur) redevient récupérable au lieu de rester bloqué en
-- `fulfilling` pour toujours. Voir src/lib/portal/fulfill.ts.
alter table portal_orders add column if not exists claimed_at timestamp;
