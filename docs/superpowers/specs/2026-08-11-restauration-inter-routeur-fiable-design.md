# Restauration inter-routeur fiable

## Objectif

Migrer les données HotSpot d'une sauvegarde SafeLinkHub vers un nouveau MikroTik sans modifier sa topologie matérielle ou réseau. Du point de vue des clients, le nouveau routeur doit se comporter comme le routeur source : mêmes profils de forfait, codes, mots de passe, validités, expirations, sessions reprenables et, lorsqu'un backup binaire compatible est fourni, identifiants de connexion persistants. La sauvegarde source fait foi pour cet état métier. Une restauration ne peut être déclarée réussie que si toutes les postconditions décrites ici sont vérifiées.

## Périmètre

La restauration peut écrire uniquement :

- les profils `/ip hotspot user profile` non système ;
- les tickets `/ip hotspot user` non système ;
- les planificateurs d'expiration MikHmon liés à ces profils ;
- les comptes temporaires de reprise de session, bornés par l'expiration du ticket ;
- les entrées de données HotSpot d'un backup binaire, dans le mode dédié décrit plus bas.

Elle ne modifie pas bridge, interfaces, radios, IP, pools, DHCP, NAT, firewall, identité matérielle, tunnel, conteneur ni portail du routeur cible. Toute référence source vers cette configuration est traduite vers la ressource déjà active sur la cible ou bloque la migration : elle n'est jamais recopiée telle quelle. Le profil serveur HotSpot de la cible doit déjà autoriser le mécanisme de session demandé par le pré-vol ; la restauration ne le modifie pas.

Les paramètres de comportement portés par un profil de ticket sont, eux, source d'autorité : on-login, on-logout, débit, partage, délais, limites et mac-cookie. Seuls `address-pool` et `parent-queue`, qui dépendent du réseau cible, sont préservés côté cible.

## Cause à éliminer

RouterOS attribue un identifiant interne à chaque profil. Une sauvegarde peut donc contenir un ticket avec `profile=*12`, tandis que le même profil, recréé sur le nouveau routeur, porte `*B`. Créer le ticket avec `*12` produit une référence orpheline affichée `unknown` dans WinBox.

La fonction de réparation existante ne voyait ce cas qu'après une restauration antérieure : elle intervenait avant l'ajout des nouveaux tickets. La migration doit traduire la référence **avant** chaque création ou mise à jour de ticket.

## Modèle de traduction des profils

1. Construire un index source : `id interne -> nom canonique` et `nom -> nom`. Le profil `default` et les comptes système sont exclus.
2. Synchroniser les profils source par leur nom. Les attributs fonctionnels source (on-login, on-logout, débit, quotas et délais) l'emportent ; les références locales au matériel (pool, parent queue) restent celles de la cible.
3. Relire les profils réellement présents sur la cible et créer un index `nom canonique -> profil cible`.
4. Lire le serveur HotSpot actif de la cible. Si la sauvegarde porte un serveur précis, le ticket est lié à ce serveur cible ; s'il n'y en a pas exactement un, le pré-vol bloque la migration plutôt que de deviner.
5. Pour chaque ticket source, résoudre sa référence de profil dans les deux index et sa référence de serveur vers la cible. Une référence vide, inconnue ou ambiguë est un échec de pré-vol.
6. Tant qu'une seule référence ne se résout pas, ne commencer aucune écriture de ticket ni de session. Le rapport liste les tickets bloquants.

Cette table est la seule autorité utilisée par les phases ticket et session : aucun ID interne, nom de serveur ou autre référence de topologie de la source n'est envoyé au routeur cible.

## Exécution transactionnelle au sens opérationnel

RouterOS ne fournit pas de transaction multi-commandes ; la stratégie est donc « préparer, écrire, vérifier » et jamais « écrire puis deviner ».

1. Pré-vol en lecture seule : vérifier le HotSpot actif, les profils source, la résolution complète et la capacité de reprise de session.
2. Synchroniser les profils source, puis les relire et refaire la résolution.
3. Créer ou mettre à jour chaque ticket source avec ses champs source et les **profil et serveur cibles résolus**. Lorsque le code existe déjà sur la cible, la sauvegarde source est prioritaire pour tous les champs métier du ticket : mot de passe, profil, statut, commentaires d'expiration, limites, MAC et serveur résolu.
4. Relire tous les tickets concernés. Vérifier : compte source présent, profil existant, profil égal au résultat traduit, serveur cible résolu, champs métier identiques à la source, et aucun profil `unknown`.
5. Restaurer les schedulers d'expiration et reprendre les sessions actives seulement à partir de ce jeu de tickets vérifié.
6. Relire les sessions temporaires créées. Toute session doit avoir un ticket source valide, un profil résolu et une date de suppression certaine.

Une erreur avant l'étape 3 ne crée aucun ticket. Une coupure après l'étape 3 peut être relancée : la même sauvegarde réécrit idempotemment la vérité source, puis reprend les vérifications.

## Cookies et continuité des connexions

L'API RouterOS expose la table de cookies comme lecture seule : une restauration logique ne peut pas insérer une ligne de cookie authentique. Elle peut toutefois reprendre les sessions actives avec des comptes MAC temporaires strictement bornés par la date d'expiration déjà portée par le ticket.

Pour conserver les cookies persistants provenant d'un fichier `.backup`, le SaaS proposera un mode séparé « continuité binaire » :

1. contrôler que le backup binaire est lisible et que son schéma RouterOS est compatible avec le routeur cible ;
2. prendre un backup de secours chiffré du routeur cible ;
3. produire un backup hybride en conservant tous les fichiers de configuration du routeur cible et en ne remplaçant que les données HotSpot source (utilisateurs, profils, identifiants de connexion) ;
4. ne charger ce backup qu'après la validation explicite du pré-vol ;
5. après redémarrage, effectuer la même vérification profils -> tickets que dans le flux logique.

Si le format, le chiffrement ou la compatibilité de version ne permettent pas cette opération, le mode binaire est bloqué et n'annonce jamais une continuité de cookies fictive. La restauration logique reste disponible, avec reprise des sessions actives vérifiées, mais son statut indique explicitement que la continuité de cookies n'a pas été obtenue. Une demande de comportement identique incluant les cookies ne peut donc aboutir à `done` qu'en mode binaire vérifié.

## Rapport de migration

Le job expose des compteurs distincts : profils synchronisés, tickets créés, tickets mis à jour, tickets vérifiés, références bloquantes, sessions reprises, cookies continus et cookies non migrables. Le statut final est :

- `done` seulement si toutes les postconditions du mode choisi passent ;
- `blocked` si le pré-vol détecte une référence impossible à traduire ;
- `error` si une écriture ou une vérification post-écriture échoue.

La page de restauration affiche les erreurs avant tout succès et détaille les codes de tickets concernés. Elle ne cache pas cet état derrière un cache de route ou de données utilisateur.

## Critères d'acceptation

- Un ticket source référant `*id-source` obtient sur la cible le nom du profil correspondant, jamais cet ancien ID.
- Un ticket homonyme déjà présent est réaligné sur la sauvegarde source, avec son serveur traduit vers la cible.
- Un profil source absent bloque la phase tickets avant toute écriture.
- Après une migration réussie, chaque ticket restauré référence un profil présent et le serveur HotSpot actif cible ; aucun ticket ne porte `unknown`.
- Une session active n'est reprise que si son ticket est valide, son profil est résolu et son expiration est certaine.
- Les cookies ne sont comptés comme conservés que dans le mode binaire qui a passé les contrôles de compatibilité et la vérification post-redémarrage ; ce mode est obligatoire pour annoncer un comportement client identique incluant les reconnexions sans saisie de code.
- Aucune commande de migration ne touche la configuration matérielle ou réseau du nouveau routeur.

## Tests

Tests unitaires, écrits avant le code, couvrent la traduction ID -> nom, les collisions de tickets où la source est prioritaire, le blocage sans écriture lorsqu'un profil ne se résout pas, et les sessions dépendant du profil traduit. Les tests d'intégration du moteur contrôlent l'ordre pré-vol -> profils -> tickets -> vérification -> sessions et l'idempotence d'une relance. Le build et la suite complète restent des prérequis de livraison.
