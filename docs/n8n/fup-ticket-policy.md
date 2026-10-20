# Régulation prorata et sanctions par ticket

L'autorité reste le moteur serveur commun au cron et à `POST /routers/:id/enforce`.
Le workflow n8n transmet l'observation puis appelle ce moteur ; il ne crée pas
un deuxième compteur de sanctions. `GET /routers` expose `fupTicketPolicy` et
les sanctions courantes `fupTicketState`. Le récap de 07 h utilise ces valeurs.
Les changements de sanction sont retournés dans `telegram` par `/enforce` et
journalisés en `fup_enforcement`, compatibles avec les notifications du SaaS.

## Quota sur le cycle

Choisir 5 000 Go pour une liaison, ou 5 000 + 5 000 Go avec cumul pour deux.
Saisir les dates réelles et la consommation déjà effectuée de chaque Starlink.
Le moteur calcule le solde, le divise par le temps restant, puis applique une
marge réseau de 20 %. La réserve est comprise dans le quota. En mode individuel,
le budget ordinaire retire la réserve avant son utilisation ; en cumul la
réserve sert de seuil d'alerte. Les débits sont des plafonds, pas des garanties.

Exemple configurable : du 11 novembre 00h au 11 décembre 00h UTC = 30 jours.
5 To / 30 = 166,67 Go/jour ; 10 To / 30 = 333,33 Go/jour avant réserve/marge.
Après utilisation, recalculer à partir du solde et des jours restants, sans
recréditer le quota. Si le 11 décembre est aussi inclus dans le cycle indiqué
par l'opérateur, la borne exclusive doit être le 12 décembre.

Les cycles réels de FOUANGA et KONGASSO ne sont pas modifiés par cet exemple.
Une panne, un redémarrage ou un cycle terminé exige un rapprochement récent.
Le cumul SaaS ne transfère pas les droits de données d'un abonnement à l'autre.

## Paramètres par zone — Régulation → Usage intensif

Par défaut, la nouvelle politique est **désactivée** pour éviter des sanctions
sans réglage conscient de la zone. Enregistrer les paramètres puis activer le
FUP après rapprochement. Le FUP en observation n'applique aucune sanction.

- Seuil proposé : 200 Mo reçus sur 15 minutes, puis bridage 256 kbit/s dans
  chaque direction, au maximum cinq heures.
- Si le ticket maintient au moins 80 % de ce débit pendant 15 minutes de
  mesures consécutives valides : **accès limité à YouTube/TikTok à 1M/1M pendant cinq heures**.
- Les seuils, la fenêtre, le débit et la durée de persistance sont configurables.
  La restriction reste fixée à cinq heures, sans prolongation à chaque passage.
- La sanction suit le nom de ticket et les sessions sont comptées séparément.
  Une reconnexion, un compteur remis à zéro, un premier relevé ou un trou de
  collecte ne prouve pas une insistance. La nouvelle session commence par une
  mesure de référence ; une sanction existante demeure.

YouTube et TikTok restent accessibles sous un plafond **agrégé de 1M/1M par ticket**, même avec plusieurs sessions. Les autres destinations Internet sont bloquées pendant la sanction. Le plafond partagé Starlink et son arrêt global restent prioritaires : l'exception ne permet pas de dépasser un quota global épuisé.

La classification repose sur des domaines DNS et leurs adresses, pas sur une reconnaissance parfaite des applications. Les clients doivent utiliser le DNS du routeur. Les CDN partagés, les noms non reconnus et le DNS chiffré peuvent autoriser une autre ressource ou empêcher certaines vidéos ; regarder et télécharger une même vidéo ne se distinguent pas sûrement. Ne pas considérer cette liste comme une frontière de sécurité absolue.

## Rétablissement et limites

Comptes HotSpot IPv4 locaux uniquement ; comptes RADIUS exclus. IPv6 actif sur l'interface HotSpot et horloge non UTC nécessitent une validation avant installation.
Une file enfant du plafond partagé bride toutes les adresses actives du ticket. Le compte, son profil et les hooks Mikhmon restent inchangés ; les sessions ne sont pas supprimées. Un ordonnanceur local met à jour les adresses toutes les cinq secondes et retire les ressources possédées à l'échéance, même si n8n est indisponible. Une reconnexion peut donc avoir une fenêtre d'environ cinq secondes avant réapplication. Les listes clientes expirent en dix secondes si ce script ne fonctionne plus ; une adresse réattribuée peut temporairement rester restreinte. Le retour à l'état normal ne réactive jamais un compte désactivé indépendamment ou expiré.

Les anciennes sanctions qui désactivaient le compte sont migrées uniquement si leur identité et commentaire correspondent encore aux métadonnées de récupération ; leur échéance n'est pas prolongée.

Le commentaire du compte, notamment la validité Mikhmon, n'est jamais modifié.
La récupération vérifie le nom, l'identifiant RouterOS et le commentaire. Si
l'administrateur modifie/remplace le compte, une vérification manuelle est
requise ; le serveur ne reprend pas sa désactivation. Un compte déjà désactivé
n'est jamais adopté et un compte supprimé pour expiration n'est pas recréé.
La limite de temps/volume native et la validité commerciale restent applicables.

Désactiver cette politique ou le FUP libère uniquement ses propres sanctions.
Éviter de modifier manuellement un compte pendant sa suspension ; utiliser le
réglage du SaaS pour libérer les sanctions. Le journal et le récap listent les
noms des tickets concernés et les échéances UTC.
