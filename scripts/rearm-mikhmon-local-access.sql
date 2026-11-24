-- Ré-arme la réconciliation de l'accès local MikHmon : remet le drapeau à null
-- pour que la synchro repasse une fois sur tout le parc avec le correctif complet
-- (ajout du dst-nat pre-hotspot qui couvre le client CONNECTÉ).
-- Miroir de la migration embarquée 0025_rearm_mikhmon_local_access.
update routers set mikhmon_local_access_at = null;
