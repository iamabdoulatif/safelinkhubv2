# Agent local RouterOS

Objectif validé dans la conversation : mettre à jour RouterOS vers la version stable proposée par le routeur, puis exécuter les trois mises à jour device-mode séparément, dans l'ordre imposé, avec confirmation physique et vérification.

Architecture : processus Node local, API HTTP sur loopback 8787–8790, interface de secours locale accessible sans le SaaS, client RouterOS existant avec transport TCP/TLS. Aucune commande réelle durant les tests. Aucun secret sur disque. Une seule tâche active pour éviter des mises à jour concurrentes. La fermeture de l'interface ne tue pas la tâche ; arrêter l'agent interrompt le suivi, sans annuler une installation déjà envoyée.

- [x] Tester l'ordre, les délais, les refus API, l'identité et la vérification après reboot avec un transport simulé.
- [x] Implémenter configurator.ts : mise à jour stable sans downgrade, vérification de version, demandes physiques séparées, avertissement si routerboard est réinitialisé.
- [x] Implémenter routeros.ts : connexion TCP/TLS et conservation de la commande en attente durant la confirmation physique.
- [x] Implémenter scanner.ts et server.ts : découverte bornée, contrôle Host/Origin/token, tâches et état sans secrets.
- [x] Fournir interface locale, scripts de lancement et documentation des limites.
- [x] Exécuter tests, TypeScript, lint et parcours HTTP simulé ; ne pas tester sur un routeur réel.

Périmètre : RouterOS 7 sur RouterBOARD. La migration majeure v6 exige une procédure distincte. Canal stable consulté dynamiquement, aucun numéro figé. Internet nécessaire depuis le routeur. Ne pas installer de package container ni mettre à jour RouterBOOT implicitement. Ne pas fusionner ni réordonner les commandes demandées. L'activation routerboard perdue après mode=advanced est signalée comme avertissement, jamais corrigée silencieusement.
