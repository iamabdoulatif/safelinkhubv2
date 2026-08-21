# Reconnexion roaming persistante entre zones

## Décision

SafeLinkHub autorise un compte roaming sur toutes les zones sélectionnées sans
redemander son code au passage d'une zone à une autre. La source de vérité de
cette mémoire est une liaison durable, contrôlée et unique entre le compte et
l'adresse MAC de son appareil. Les cookies HotSpot accélèrent le retour du
navigateur, mais ils ne sont pas la preuve d'identité ni le seul mécanisme de
reconnexion.

Un code payant ne devient jamais illimité : son autorisation MAC et ses
cookies cessent avec son expiration. Un compte sans expiration reste mémorisé
jusqu'à sa suspension, sa suppression ou au changement explicite d'appareil.

## Constat de départ

Le provisionnement actuel crée déjà le même compte sur tous les routeurs d'un
groupe et active `mac` / `mac-cookie`. À la première connexion,
`/api/roaming/seen` lance une propagation de l'adresse MAC vers les routeurs
du groupe. Cette propagation est toutefois best-effort : une zone hors ligne
est ignorée, aucun état de rattrapage n'est conservé et l'interface ne peut pas
indiquer précisément où l'accès automatique est prêt.

Le paramétrage d'auto-setup fixe déjà certains cookies HTTP à `52w1d`. Il faut
aligner ce réglage avec les profils existants et définir aussi une durée longue
pour les mac-cookies. Cette durée améliore l'expérience navigateur, sans
prétendre rendre un cookie éternel : le lien MAC persistant porte la garantie
fonctionnelle.

## Modèle de données

Deux tables additives rendent le rattrapage explicite et idempotent :

- `roaming_device_bindings` : une ligne par voucher/compte roaming, avec
  `org_id`, `voucher_id` unique, `mac_address`, `bound_at`, `updated_at` et
  `revoked_at` éventuel. Une contrainte garantit un seul appareil mémorisé par
  compte.
- `roaming_device_binding_routers` : une ligne par liaison MAC et zone du
  groupe, avec `router_id`, `status` (`PENDING`, `SYNCED` ou `ERROR`),
  `attempts`, `last_error`, `last_attempt_at` et `synced_at`. L'unicité
  `(binding_id, router_id)` interdit les doublons lors de connexions ou de
  reprises concurrentes.

Les tables sont uniquement techniques : les comptes continuent d'être portés
par `vouchers`, les groupes par `roaming_groups` et les zones par
`roaming_group_routers`.

## Flux de première connexion

1. Le routeur qui accepte un compte roaming appelle le webhook signé existant.
2. SafeLinkHub vérifie en direct que la session `username + MAC` est bien
   active sur ce routeur ; une requête forgée ne peut donc pas créer de lien.
3. Dans une transaction, SafeLinkHub crée la liaison MAC si elle n'existe pas.
   Si un autre appareil est déjà lié, il refuse le basculement implicite et
   conserve l'appareil d'origine.
4. Pour chaque routeur du groupe, la synchronisation crée ou met à jour le
   compte MAC compagnon, lie le code source au même MAC et conserve le profil
   et l'expiration du compte. Chaque résultat est enregistré par zone.
5. Le webhook répond immédiatement ; sa propagation reste détachée afin de ne
   jamais ralentir la connexion initiale du client.

Après cela, un appareil qui arrive sur une autre zone perd nécessairement sa
liaison radio Wi-Fi, puis est réautorisé automatiquement par `login-by=mac`
sans afficher de portail ni demander le code.

## Reprise automatique et cohérence

La synchronisation est une opération idempotente qui peut être rejouée sans
créer d'utilisateur en double. Une zone indisponible passe à `PENDING` ou
`ERROR`, jamais à un faux état synchronisé.

Le retour d'un routeur détecté dans `syncRouterStats` lance, sur sa connexion
RouterOS déjà ouverte, la réconciliation de toutes les liaisons roaming en
attente pour cette zone. Ce chemin évite une nouvelle connexion et traite
automatiquement les comptes mémorisés dès que le MikroTik redevient joignable.
Le cron existant de réconciliation des vouchers agit comme second filet pour
les tentatives en attente, avec une limite de travail pour ne pas surcharger
un routeur.

Les opérations de création, modification de profil, ajout de zone, suspension,
suppression et expiration appellent la même réconciliation ou révocation :

- l'ajout d'une zone initialise une ligne d'état pour chaque liaison active et
  la synchronise avant de la déclarer prête ;
- la suspension, l'expiration et la suppression retirent le compte MAC, le
  lien code→MAC, les sessions actives et les cookies HotSpot associés sur
  chaque zone ;
- le changement d'appareil est une action explicite avec confirmation : il
  révoque l'ancien lien et permet à la prochaine connexion valide d'en créer
  un nouveau.

## Configuration RouterOS

La préparation de profil reste centralisée et idempotente. Elle garantit :

- `login-by` contient `mac`, `mac-cookie`, `cookie`, `http-chap` et
  `http-pap`, sans supprimer de méthode existante ;
- les profils de compte ont `add-mac-cookie=yes`, un `mac-cookie-timeout`
  long et des `idle-timeout` / `keepalive-timeout` désactivés pour le roaming ;
- les profils serveur HotSpot ont un `http-cookie-lifetime` long, aligné sur
  `52w1d` déjà utilisé par l'auto-setup ;
- l'échéance tarifaire demeure portée par le profil et le commentaire
  d'expiration : aucun réglage de mémoire ne contourne un ticket expiré.

La valeur d'un an est une convenance de cookie. Le retrait immédiat du compte
MAC est la révocation qui compte réellement ; la reconnexion ne dépend jamais
de la survie d'un cookie de navigateur.

## Interface d'administration

L'onglet **Comptes** de la station roaming reçoit, pour chaque compte :

- l'état « appareil mémorisé » ou « appareil à mémoriser » ;
- un compteur de zones synchronisées sur le total, avec la liste des zones en
  attente ou en erreur et le dernier motif connu ;
- une action **Resynchroniser** qui déclenche le même traitement idempotent
  qu'une reprise automatique ;
- une action **Changer d'appareil** avec confirmation, visible uniquement si
  un appareil est lié ;
- les actions existantes Modifier, Mot de passe, Suspendre/Activer et
  Supprimer, qui continuent de respecter leurs règles de sécurité.

L'exploitation du groupe montre également les zones roaming en attente afin
qu'un opérateur puisse distinguer un problème de connexion client d'un
MikroTik indisponible. Les états comportent toujours texte et nombre, pas
seulement une couleur.

Le projet possède déjà sa propre bibliothèque Tailwind et ses panneaux
accessibles ; cette extension réutilise ces composants visuels. Aucune
initialisation ou copie non nécessaire de composants shadcn/ui n'est prévue.

## Sécurité et erreurs

- Tous les chargements et actions restent bornés à l'organisation de la
  session ; le webhook reste authentifié par une clé dérivée du routeur.
- Le mot de passe du compte n'est jamais enregistré dans la nouvelle table.
- Une MAC invalide ou une session absente ne produit aucune liaison.
- Deux connexions concurrentes du même code convergent vers la première MAC
  validée par la contrainte unique ; une autre MAC est refusée sans écraser la
  première.
- Une erreur RouterOS est mémorisée par zone et est réessayée au retour du
  routeur. Elle ne déconnecte pas l'appareil de la zone déjà fonctionnelle.
- Les opérations destructrices conservent la règle actuelle : elles ne sont
  pas déclarées terminées tant qu'un routeur susceptible d'autoriser encore le
  compte n'a pas été traité ou inscrit explicitement à la révocation en attente.

## Tests et validation

Les tests couvriront : création de liaison, refus d'une seconde MAC,
idempotence de la synchronisation, état d'un routeur hors ligne puis reprise,
propagation vers une zone ajoutée, révocation/changement d'appareil,
préservation de l'expiration et paramètres RouterOS de cookies/login. Les
tests d'interface vérifieront les statuts par zone et les deux nouvelles
actions, en plus des actions roaming déjà existantes.

La validation finale inclut les tests ciblés puis complets, le contrôle de
types, le lint, le build et une vérification manuelle avec un compte valide sur
au moins deux MikroTik du groupe.

## Alternatives écartées

- **Cookie seul** : effaçable, dépendant d'un navigateur et sans portée entre
  HotSpot distincts ; il ne répond pas au passage inter-zones.
- **RADIUS central** : robuste à grande échelle mais implique une nouvelle
  infrastructure et la reconfiguration de tous les routeurs. Il ne se justifie
  pas alors que le modèle de groupe et la propagation RouterOS sont déjà en
  production.
- **Vercel Queues** : utile pour un flux distribué plus vaste, mais introduirait
  une dépendance et une configuration de déploiement alors que la persistance
  en base, les webhooks actuels et le health-check fournissent ici une reprise
  déterministe, observable et locale au domaine métier.
