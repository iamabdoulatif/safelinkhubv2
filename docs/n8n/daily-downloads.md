# Téléchargements quotidiens Telegram

Le workflow « SafeLinkHub - Régulation (seuils plateforme) » conserve sa branche
de régulation toutes les cinq minutes. Sa branche « Résumé quotidien 07h »
envoie au bot privé de la plateforme un récapitulatif par routeur à 07:00 UTC
(Africa/Abidjan). Le rapport couvre la veille civile, de 00:00 à 00:00 UTC.

## Branche quotidienne

`Résumé quotidien 07h → Récap : routeurs → Récap : boucle → Récap : lire compteurs
→ Récap : formater → Récap : envoyer Telegram → Récap : fin → boucle`.

- « Récap : lire compteurs » utilise désormais **POST
  /api/internal/n8n/regulation/routers/:id/daily-usage**, avec le même credential
  HTTP Bearer dédié. Aucun appel MikroTik ni modification de files d'attente.
- « Récap : formater » utilise `pooled-recap.js`. Conserver le chat ID privé
  déjà configuré dans le nœud Telegram et son credential ; ne pas y coller le
  token du bot dans le JavaScript.
- Le rapport présente les téléchargements (RX WAN), les envois (TX WAN), chaque
  liaison et le total du site. FOUANGA cumule les deux WAN ; KONGASSO garde sa
  liaison unique. Les soldes de cycle restent séparés des volumes journaliers.
- L'état FUP joint provient du dernier ledger enregistré : sa date et ses
  contrôles de fraîcheur restent applicables. Ce rapport ne force aucune
  régulation, aucune remise à zéro et aucun rétablissement de service.

## Fiabilité

Les volumes proviennent des différences de compteurs persistées dans
`router_traffic_samples` par la collecte cinq minutes. Un intervalle monotone
plus long conserve son volume connu, même lorsque son débit instantané ne peut
être affiché. Les premiers relevés, remises à zéro, valeurs absentes et
intervalles chevauchant minuit ne sont pas estimés. Les doublons/recouvrements
ne sont pas additionnés. Une interface changée ne réutilise pas les anciens
compteurs sous le même identifiant.

Chaque liaison affiche la couverture temporelle effectivement attribuable à
la journée. Sans données, le volume est « indisponible », jamais zéro. Une
couverture partielle produit un total mesuré susceptible d'être inférieur au
volume réel. Les écarts de quelques minutes aux bornes de journée sont ainsi
visibles ; il ne s'agit pas d'un relevé contractuel Starlink. Le FUP reste basé
sur réception **et** émission, et non sur le seul téléchargement.

Un routeur temporairement hors ligne n'empêche pas l'envoi de l'historique.
Une panne de l'API ou de la base doit en revanche suivre la branche d'erreur
quotidienne, sans transformer l'erreur en consommation nulle.

## Vérification

Tests : changement de mois/année UTC, RX distinct de TX, cumul des WAN, absence
versus zéro, resets, bornes minuit, intervalles longs, doublons et format du
message. Après déploiement, vérifier l'API interne authentifiée puis exécuter
uniquement le déclencheur quotidien pour tester l'envoi sans appeler /enforce.
