# SafeLinkHub Agent local

Agent Node.js autonome pour préparer un MikroTik RouterOS **7** : mise à jour vers la dernière version **stable proposée par MikroTik**, puis les trois commandes device-mode séparées dans l'ordre demandé. Interface locale intégrée et API REST consommable par le frontend Next.js. Aucun appel au SaaS, aucune base de données nécessaire. Pas de déploiement Vercel : le processus doit tourner sur l'ordinateur relié au routeur.

## Démarrer

Pré-requis : Node.js compatible avec le projet (20.9 minimum), dépendances du dépôt déjà installées (`npm install` lors de l'installation initiale).

- macOS : double-cliquer sur `agent/Demarrer.command`.
- Windows : double-cliquer sur `agent/Demarrer.cmd`.
- Linux : lancer `agent/demarrer.sh`.

Ces lanceurs ouvrent le navigateur sur le port réellement choisi. Le terminal du processus doit rester ouvert. Ce ne sont pas des installateurs distribuables signés.

Depuis la racine du dépôt :

```sh
npm run agent -- --open
```

Simulation, sans scan, connexion au routeur ni commande :

```sh
npm run agent:dry-run
```

L'interface est sur `http://127.0.0.1:8787` ; les ports 8788–8790 sont essayés si nécessaire. Aucun travail n'est lancé au démarrage. Choisir un routeur, renseigner ses identifiants et cocher l'accord avant de cliquer sur Configurer. TCP 8728 est non chiffré. TLS 8729 vérifie le certificat : pour une autorité privée, fournir son certificat PEM dans l'interface (le certificat serveur doit couvrir l'IP utilisée).

## Parcours

1. Authentifier le routeur et lire son numéro de série, son architecture, sa version et son device-mode. Refuser une architecture incompatible ou un appareil flagged.
2. Sélectionner le canal stable ; rechercher la version disponible. Ne jamais downgrader. Télécharger et installer si nécessaire ; attendre jusqu'à 15 minutes puis vérifier la version ET le numéro de série. Rechercher à nouveau pour prendre en compte les versions intermédiaires (5 passages maximum).
3. Exécuter `/system/device-mode/update routerboard=yes` si nécessaire, attendre la confirmation physique et vérifier le résultat.
4. Exécuter `/system/device-mode/update mode=advanced` si nécessaire, attendre et vérifier.
5. Exécuter `/system/device-mode/update container=yes hotspot=yes scheduler=yes fetch=yes` si nécessaire, attendre et vérifier.
6. Lire `/system/device-mode/print` et vérifier `mode`, `container`, `hotspot`, `scheduler`, `fetch`. Si `routerboard` a été annulé par le changement de mode, terminer **avec avertissement**, jamais avec un succès sans réserve. Aucune quatrième commande corrective implicite.

Les commandes déjà satisfaites sont ignorées. Chaque demande physique a sa fenêtre de 5 minutes, suivie d'une tolérance de retour réseau de 2 minutes. Aucun bouton « J'ai terminé » ne valide une étape : seul l'état relu sur le même routeur compte. Ne pas couper l'alimentation durant l'installation RouterOS ; attendre l'instruction explicite de confirmation physique.

Le processus garde les identifiants en mémoire pendant la tâche puis abandonne leur référence. Pas d'écriture des secrets sur disque, pas de localStorage des secrets (JavaScript ne garantit pas l'effacement physique immédiat de la mémoire). Les événements structurés sans identifiants sont écrits dans `agent/safelinkhub.log`.

Fermer/recharger la page n'arrête pas la tâche : l'identifiant de suivi reste dans sessionStorage. Arrêter l'agent perd son état en mémoire, mais n'annule pas une installation déjà demandée au routeur. Aucun redémarrage automatique d'une écriture après interruption ; vérifier le routeur avant de relancer.

## Détection

Sondes TCP 8728/8729 sur les interfaces IPv4 privées selon leur masque réel (1024 adresses maximum au total), avec écoute passive MNDP pendant 3,5 secondes. Les annonces MNDP peuvent arriver après cette fenêtre : relancer la recherche ou saisir l'IP. Sous-réseaux plus grands : IP manuelle. Les annonces et ports ouverts sont des **candidats**, pas une preuve d'identité. Déduplication par IP. Les ports personnalisés se saisissent manuellement. Sans API accessible, l'agent ne peut pas l'activer par ce même canal.

## API locale

`GET /health` identifie le service et le mode simulation. `GET /session` fournit un jeton éphémère après contrôle de Host/Origin. Tous les endpoints suivants exigent `X-Agent-Token` :

- `GET /agent/routers` : candidats et limites du scan (cache 15 secondes).
- `POST /agent/routers/:ip/configure` : JSON `{ username, password, port, tls, ca? }`, retourne HTTP 202 et un identifiant de tâche. Refuse une seconde tâche active avec HTTP 409.
- `GET /agent/tasks/:id/status` : état, étape, délai, résultat et avertissements. Polling conseillé : 2 secondes.

Écoute HTTP exclusivement sur 127.0.0.1. Origines acceptées : interface de l'agent et Next.js sur localhost:3000 / 127.0.0.1:3000. L'écoute passive UDP MNDP utilise les interfaces réseau locales. L'agent ne remplace pas les scripts dev/start du SaaS existant ; son interface fonctionne indépendamment de Next.js et son API est prête pour une intégration.

## Limites explicites

- **Internet est nécessaire depuis le routeur** pour la mise à jour RouterOS. Il s'agit d'une exception à l'objectif initial « tout local ».
- RouterOS 6, versions testing/development et équipements sans numéro de série : arrêt explicite, pas de migration majeure improvisée.
- L'agent ne met **pas RouterBOOT à jour** : `routerboard=yes` autorise des fonctionnalités et n'est pas une mise à jour du firmware.
- Autoriser `container=yes` n'installe ni le package container ni une image/container, hotspot ou configuration DHCP/NAT.
- Le mot « dernière » désigne la version stable proposée par le service de mise à jour pour ce routeur au moment de l'exécution, sans numéro figé.
- Essai sur appareil physique indispensable avant utilisation en production. Les tests du dépôt utilisent exclusivement des simulations et des sockets loopback.

## Validation

```sh
npm run agent:test
npm run agent:typecheck
npx eslint agent/src agent/test agent/ui/ui.js
```

Références officielles :
- https://help.mikrotik.com/docs/spaces/ROS/pages/328142/Upgrading+and+installation
- https://manual.mikrotik.com/docs/system-information-and-utilities/device-mode/
- https://help.mikrotik.com/docs/spaces/ROS/pages/47579160/API
