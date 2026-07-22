# Reprise sécurisée des accès VPN — conception

**Date :** 22 juillet 2026
**Statut :** validé pour planification
**Portée :** accès distant WireGuard/OpenVPN, MikHmon, WinBox, SSH/SFTP et WebFig.

## Objectif

Un client qui a acheté des accès distants doit pouvoir remplacer un MikroTik endommagé sans repayer ses services ni changer les adresses publiques déjà communiquées à ses équipes. Le superadmin doit pouvoir retrouver les accès achetés et transmettre les informations de connexion de manière contrôlée.

Le produit ne réutilise jamais une ancienne clé WireGuard ou un ancien script. Il émet un script de remplacement à usage unique qui installe une nouvelle clé, puis bascule les droits payés vers le nouveau routeur lorsque celui-ci est réellement connecté.

## Constat actuel

- Le script WireGuard est généré dans le navigateur puis son jeton est effacé après l'installation. La clé privée du pair n'est volontairement jamais stockée côté SaaS.
- Les services achetés sont des lignes `router_port_forwards`, liées à un routeur, à un port public et à une date d'expiration.
- Les identifiants du compte RouterOS géré par SafeLinkHub sont chiffrés en base. Ils peuvent être révélés côté serveur, mais ne doivent pas être rendus dans le HTML initial ni conservés par le navigateur.

Ces choix empêchent la récupération du script d'origine, mais protègent contre la duplication d'une clé sur deux routeurs. Le parcours de reprise corrige l'expérience sans diminuer cette protection.

## Design retenu : transfert sécurisé vers un routeur de remplacement

### Coffre Superadmin « Accès VPN clients »

Une page réservée au superadmin liste les accès distants actifs, avec recherche par client, organisation, routeur ou service. Chaque fiche affiche :

- le client et son routeur ;
- les services actifs : MikHmon, WinBox, SSH/SFTP et WebFig ;
- l'adresse/port public et la date d'expiration de chaque service ;
- l'identifiant RouterOS ;
- un mot de passe masqué, révélable uniquement après une action explicite ;
- les actions **Copier les accès** et **Préparer WhatsApp**.

Le message WhatsApp est seulement pré-rempli dans le navigateur. SafeLinkHub ne transmet pas de secret automatiquement par email ou WhatsApp. Une révélation, une copie ou la préparation d'un message crée une entrée d'audit sans jamais y conserver le mot de passe.

### Parcours « Remplacer ce routeur »

1. Le propriétaire de l'organisation, ou le superadmin, sélectionne le routeur endommagé et confirme son remplacement.
2. SafeLinkHub crée un routeur de remplacement en état `pending`, lié au routeur source par une reprise unique en attente. Une seconde reprise ne peut pas être créée tant que la première n'est pas terminée ou annulée.
3. L'interface remet une nouvelle commande WireGuard ou OpenVPN, valable deux heures et utilisable une seule fois. Elle est clairement intitulée « Script de remplacement ».
4. Le nouveau MikroTik télécharge le script, reçoit une nouvelle clé de tunnel et signale sa connexion à SafeLinkHub.
5. Le serveur bascule alors les services actifs et leurs périodes restantes du routeur source vers le remplacement. Les numéros de ports publics et les adresses déjà communiquées sont conservés.
6. Le pair VPN de l'ancien routeur est révoqué, les règles relay pointent vers la nouvelle IP tunnel, et l'ancien routeur est marqué `replaced` sans être supprimé.

Le remplacement est gratuit : aucune nouvelle autorisation d'accès distant, aucun nouveau débit de portefeuille et aucune nouvelle période ne sont créés.

### Reprise de l'Auto-Setup et de MikHmon

Si le routeur source possédait une configuration Auto-Setup mémorisée et un droit Auto-Setup payé, le routeur de remplacement hérite de ce droit pour cette seule chaîne de remplacement. Il peut donc rejouer la configuration sans nouveau paiement. Cette reprise ne crée pas un second droit réutilisable : une fois l'ancien routeur remplacé, il demeure retiré.

Le transfert du lien MikHmon conserve son URL et son abonnement, mais le nouveau routeur doit d'abord recevoir le conteneur MikHmon via l'Auto-Setup ou la restauration. Pendant cette phase, la fiche indique « préparation MikHmon requise » au lieu de promettre un accès fonctionnel. La restauration des tickets et des données du hotspot reste le parcours de sauvegarde existant ; elle n'est jamais effectuée silencieusement lors du transfert VPN.

## Sécurité et cas limites

| Risque | Réponse retenue |
| --- | --- |
| L'ancien routeur redémarre après le remplacement | Son pair WireGuard/OpenVPN est révoqué au basculement. Il ne peut plus joindre le relais. |
| Le script est copié ou perdu | Il ne contient qu'un jeton hashé côté serveur, expire en deux heures et devient invalide après sa première utilisation. |
| Le nouveau routeur n'arrive jamais à se connecter | Aucun port ni abonnement ne bouge. Le client peut annuler la reprise ou générer un nouveau script pour le même remplacement. |
| Le basculement échoue à mi-chemin | La reprise garde un état explicite. Les règles relay et les lignes de base sont reprises de manière idempotente jusqu'à réussite ; aucun port neuf n'est attribué. |
| Deux routeurs utilisent la même clé | Impossible : la reprise génère toujours un nouveau pair et ne stocke pas la clé privée précédente. |
| Mot de passe révélé à tort | Le mot de passe n'est déchiffré que dans une Server Action superadmin, est rendu seulement après clic et n'est jamais mis dans une liste, un log ou un audit. |
| MikHmon n'est pas encore installé sur le remplacement | Le forward est conservé, mais l'état opérationnel prévient que le service attend l'Auto-Setup/restauration. |

## Données

Une table de reprise dédiée évite de surcharger le statut libre du routeur et permet un audit fiable :

- routeur source et routeur de remplacement ;
- organisation, initiateur, état `pending`, `installing`, `completed`, `cancelled` ou `failed` ;
- dates de création, de basculement et de fin ;
- erreur technique non sensible, si présente.

Une table d'audit des accès VPN conserve l'identifiant du superadmin, le routeur concerné, le type d'action (`revealed`, `copied`, `whatsapp_prepared`, `replacement_started`, `replacement_completed`) et l'horodatage. Aucun secret, script, token ou mot de passe n'est stocké dans cet audit.

Les `router_port_forwards` existants sont mis à jour à la fin de la reprise : `routerId` et `tunnelIp` deviennent ceux du nouveau routeur ; service, port public, période et expiration restent inchangés. Les mouvements de portefeuille restent attachés au forward historique et ne sont pas recréés.

## Architecture

- Un module métier de reprise porte les transitions d'état, l'autorisation organisation/superadmin et le calcul des services transférables.
- La route de script WireGuard/OpenVPN détecte qu'un routeur `pending` est un remplacement, alloue le nouveau pair puis mémorise son IP tunnel.
- Le callback d'installation finalise la reprise : mise à jour idempotente des règles relay, transfert transactionnel des forwards, révocation de l'ancien pair et revalidation des pages concernées.
- Un module de coffre VPN effectue les requêtes superadmin et les Server Actions de révélation/copie. Le déchiffrement du mot de passe reste dans ce module serveur.

## Critères d'acceptation

1. Le superadmin voit les services VPN achetés pour toutes les organisations, peut rechercher un client et obtenir les identifiants après une action explicite.
2. Un utilisateur d'une organisation ne voit que ses propres routeurs et peut lancer une seule reprise active à la fois.
3. La reprise produit une nouvelle clé et un nouveau script temporaire ; l'ancien script et l'ancienne clé ne sont jamais récupérables.
4. Une fois le remplacement connecté, MikHmon, WinBox, SSH/SFTP et WebFig conservent leurs ports, URLs et expirations sans nouveau paiement.
5. L'ancien routeur ne peut plus atteindre le relais après le basculement.
6. Un échec avant connexion conserve intégralement les accès de l'ancien routeur et permet une nouvelle tentative contrôlée.
7. Les identifiants et les scripts ne sont présents ni dans le HTML initial, ni dans les logs métier, ni dans la table d'audit.
8. Une Auto-Setup payée liée au routeur source peut être reprise uniquement par le routeur de remplacement de cette même chaîne.

## Hors périmètre

- transférer automatiquement les tickets ou données hotspot sans passer par la restauration de sauvegarde ;
- conserver, exporter ou réutiliser une ancienne clé privée WireGuard ;
- envoyer automatiquement des mots de passe par email ou WhatsApp ;
- créer un nouveau service payant ou rallonger une période à l'occasion d'une reprise.
