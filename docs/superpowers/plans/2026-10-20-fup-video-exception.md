# Exception vidéo FUP — plan

Objectif : YouTube/TikTok à 1M/1M pendant la sanction de ticket, sous le plafond partagé. L'arrêt global Starlink ne change pas.

- [x] Écrire les tests réseau : aucune désactivation de compte, filtrage sélectif, plafond agrégé par ticket, échéance stable, restauration des sanctions anciennes, suppression des seules ressources possédées.
- [x] Implémenter des ressources RouterOS dédiées et leur récupération locale ; préserver les profils et commentaires Mikhmon et les filtrages existants.
- [x] Mettre à jour service, panneau, récapitulatif n8n et documentation publique ; préciser les limites DNS/CDN et le temps de réconciliation.
- [ ] Vérifier compatibilité RouterOS par un essai isolé sans client réel, effectuer la revue, typecheck/lint/tests, puis déployer et vérifier la version de production.

Vérifications du 20 octobre 2026 : 1 471 tests réussis, 3 ignorés, aucune erreur TypeScript/lint (deux avertissements préexistants hors périmètre). Revue indépendante effectuée. Essais isolés RouterOS 7.19.1 : DNS FWD et apprentissage d’adresses après une requête DNS UDP réelle ; session simulée TEST-NET, file 1M/1M, liste d’adresses, démarrage immédiat du contrôle, suppression à échéance et compte intact. Toutes les ressources de test ont été retirées. Aucun client réel sanctionné. Lecture vidéo réelle et mesure de débit sur téléphone non vérifiées.
