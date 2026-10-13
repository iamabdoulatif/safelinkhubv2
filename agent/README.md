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

## Diagnostic et dépannage

Carte « Diagnostiquer et dépanner » de l'interface (mêmes adresse et identifiants que l'étape 1). Le diagnostic est en **lecture seule** ; chaque réparation se lance séparément, par l'utilisateur.

- **Identité** : modèle, nom commercial, numéro de série, adresse MAC (port d'usine ether1), RouterOS, firmware, durée d'allumage, score de santé.
- **Tickets MikHmon qui n'expirent pas** : horloge fausse ou NTP inactif (réparation : activer NTP), dates d'expiration au format ISO de RouterOS 7.24 et balayage d'expiration cassé (réparations reprises du SaaS).
- **Wi-Fi invisible** : radio désactivée (réactiver), SSID masqué (rendre visible), 5 GHz coincé en DFS (débloquer), SSID vide, paquet Wi-Fi absent (signalé : installation manuelle).
- **Configuration supprimée** : NAT absent (recréer sur le WAN), DNS fermé aux clients, serveur DHCP ou hotspot désactivé (réactiver), client DHCP du WAN supprimé (recréer). Un serveur DHCP ou hotspot entièrement supprimé est signalé (à recréer avec l'assistant RouterOS).
- **Ports abîmés** : erreurs physiques (FCS, alignement, fragments, jabber, collisions tardives), coupures de liaison répétées, half-duplex ou 10 Mbit/s — avec le **nom** de chaque port (et son nom d'usine).
- **Session MikHmon effacée** dans MikHmon : détectée en lisant le `config.php` du conteneur, restaurée (compte API `mikhmon-api` limité au réseau des conteneurs, mot de passe d'ouverture de MikHmon conservé), puis vérifiée.
- Le reste vient de l'audit du SaaS (CPU, mémoire, flash, route, NAT, fasttrack, conteneur MikHmon, firmware…).

« Réparer tout ce qui est sûr » enchaîne les réparations sans geste sur site. NAT et client DHCP du WAN restent unitaires (ils touchent l'accès Internet). Endpoints : `POST /agent/routers/:ip/health` et `POST /agent/routers/:ip/fix` (`{ ...identifiants, fix }`), qui renvoie le message et le diagnostic relu.

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
- **Firmware RouterBOARD** : après RouterOS, si `current-firmware` ≠ `upgrade-firmware`, l'agent lance `/system/routerboard/upgrade`, redémarre, puis vérifie le nouveau firmware (même numéro de série). Ne pas confondre avec `routerboard=yes` (device-mode), qui autorise des fonctionnalités.
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

## Nouveau mot de passe Winbox

Une fois la préparation terminée, l’agent demande un nouveau mot de passe pour le compte utilisé (`admin`). Il refuse les mots de passe faibles, l’applique (`/user/set`) puis le **vérifie en se reconnectant avec**. Le mot de passe reste en mémoire et n’apparaît jamais dans les journaux.

## Paquets RouterOS (container, zerotier, wifi-qcom…)

« Afficher les paquets disponibles » lance une recherche de mise à jour puis liste les paquets comme *System › Packages* de Winbox (les « XA » = disponibles). Les paquets cochés sont activés (`/system/package/enable`) après la mise à jour RouterOS, puis `/system/package/apply-changes` les télécharge et redémarre — ce redémarrage applique aussi le firmware RouterBOARD. `container` est pré-coché (MikHmon). Désinstaller n'est pas proposé.

## MikHmon : expiration des tickets et revenus (tout MikHmon)

Les scripts MikHmon vivent sur le **routeur** (profils hotspot, ventes dans `/system script`) : même correctif pour laksa19/mikhmonv3 d'origine et `mikhmon-sf-v1`.

- **Profils incompatibles RouterOS 7.10+** (dates ISO) → « Réparer l'expiration » : conversion de date ajoutée au `on-login` (les variantes qui la gèrent déjà ne sont pas touchées) + balayages d'expiration recréés.
- **Ventes absentes des rapports** → « Réparer les revenus » : ventes remises au format MikHmon (`oct/13/2026`, `owner=oct2026`). Aucune vente supprimée.
- **RouterOS 7.24+** : le hotspot écrase `owner` en `*sys` → revenus mensuels à 0. La réparation pose la tâche `slh-mikhmon-owner` (2 min) qui corrige les nouvelles ventes.
- La liste des paquets montre `routeros` (version installée → version disponible), mis à jour par la préparation.
