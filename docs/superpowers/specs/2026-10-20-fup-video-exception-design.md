# Exception vidéo pendant la sanction FUP

## Demande
Pendant la sanction actuellement nommée « coupure complète », YouTube et TikTok doivent rester accessibles avec un plafond de 1 000 000 bit/s en émission et en réception. Les autres usages Internet restent coupés. Ne pas remplacer cette demande par un accès Internet général à 1M/1M.

## Diagnostic vérifié
`fup-ticket-router.ts` désactive le compte HotSpot et retire ses sessions : aucune exception applicative n'est possible dans cet état. Le service, le récapitulatif n8n et le guide public décrivent explicitement une coupure incluant les vidéos. Ce changement exige donc une nouvelle sanction réseau, et pas seulement une modification de texte.

## Proposition technique
- Garder le compte local actif, sans modifier son commentaire, sa validité ou ses identifiants.
- Conserver la durée de cinq heures et l'échéance initiale, sans prolongation lors des réconciliations.
- Reconnaître les destinations vidéo par domaines DNS et listes d'adresses gérées, avec règles limitées aux tickets sanctionnés. Ne pas autoriser tous les réseaux Google ou ByteDance.
- Appliquer un plafond symétrique de 1M/1M par ticket sur ses sessions, sans additionner 1M par appareil.
- Bloquer les autres destinations pour ces tickets, préserver les accès locaux nécessaires au portail et à la résolution DNS.
- Assurer la reconnexion et la récupération locale à échéance ; retirer les règles et listes uniquement possédées par ce module.
- Migrer les anciennes sanctions uniquement si l'identité du compte et son commentaire correspondent aux métadonnées de récupération. Ne pas réactiver un compte expiré ou désactivé indépendamment du FUP.
- Vérifier versions RouterOS, IPv6, FastTrack, cache DNS, redémarrage, expiration et retour arrière avant activation.

## Limites à expliquer
Une liste DNS/IP n'est pas une reconnaissance parfaite d'application : CDN partagés, DNS chiffré et changements de domaines peuvent produire des faux positifs ou des vidéos indisponibles. Une vidéo téléchargée et une vidéo regardée peuvent emprunter le même flux ; cette exception ne peut pas interdire tout téléchargement vidéo.

## Décision utilisateur
Exception uniquement pendant la sanction par ticket. Le quota global Starlink conserve ses règles d'arrêt et son plafond partagé ; aucune règle d'acceptation prioritaire ne doit les contourner.

## Vérifications requises
Tests de commandes et état simulé : ticket normal inchangé ; sanction vidéo sans désactivation ; plafond combiné multisession ; autres destinations bloquées ; reconnexion ; récupération et migration ; isolation entre tickets ; quota partagé selon la décision utilisateur. Essai contrôlé sur un routeur autorisé pour confirmer lecture vidéo réelle : les tests simulés seuls ne prouvent pas la reconnaissance des applications.

## Implémentation et limites validées
Les profils ne sont pas clonés. Le suivi local des sessions par ticket s'exécute toutes les cinq secondes ; les adresses clientes expirent en dix secondes sur erreur. Il subsiste une courte fenêtre à la reconnexion et un risque temporaire sur une IP réattribuée. Les chaînes vidéo utilisent uniquement retour/drop : elles ne contournent pas les filtres et l'arrêt global. Le plafond est agrégé par ticket, et non par appareil. Les comptes expirés/désactivés hors ancienne sanction FUP ne sont pas réactivés.

La compilation seule n'est pas une preuve d'exécution : les essais RouterOS ont également vérifié le format en minuscules des identifiants dans les scripts, le démarrage immédiat du scheduler, la mise à jour d'une session simulée et le nettoyage à échéance. Le DNS FWD peuple bien une liste pour une requête DNS cliente ; un simple appel interne :resolve ne suffit pas à le vérifier. La lecture réelle YouTube/TikTok reste dépendante des domaines et du DNS des appareils.
