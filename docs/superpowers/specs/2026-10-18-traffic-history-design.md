# Historique du trafic Starlink

## Demande et décision
Collecter toutes les cinq minutes les compteurs de chaque liaison Starlink, les utilisateurs connectés et échangeant des données, et les périodes FUP, restriction et panne. L’utilisateur demande les restrictions SafeLinkHub et Starlink, en distinguant confirmé et suspecté. Interface conforme à la charte Slate existante.

## Données
Historique central persistant, sans purge automatique ; chaque point garde l’heure réelle, le créneau cinq minutes, RX/TX cumulés et différentiels, durée réelle, débits moyens, disponibilité de l’interface et état de lecture. Un compteur réinitialisé, un redémarrage ou un relevé manquant produit une lacune, jamais une consommation négative ou zéro inventé. Un relevé après une longue lacune peut conserver un volume couvrant l’intervalle, sans prétendre connaître sa répartition cinq minutes par cinq minutes.
Sessions hotspot et PPPoE comptées au niveau du routeur. Une session échangeant des octets depuis le précédent relevé est active ; premier relevé ou intervalle manquant = activité inconnue. Les compteurs de sessions temporaires sont hachés et conservés uniquement pour calculer le prochain intervalle.

## Incidents
Files/FUP constatés sur MikroTik : source SafeLinkHub, confirmé par lecture réelle. Absence de réponse API : collecte indisponible, pas panne Starlink confirmée. Interface WAN arrêtée : liaison indisponible confirmée, pas diagnostic de cause fournisseur. Baisse de débit seule : aucun verdict automatique de FUP. Déclaration horodatée par administrateur d’un incident fournisseur, avec source/preuve et statut confirmé ou suspecté ; fin datable. Les états mesurés restent dans chaque relevé, l’interface reconstruit les périodes sans traverser les trous.

## Collecte et accès
Passage léger au début du cron de santé déjà exécuté toutes les cinq minutes ; seules les liaisons configurées explicitement FUP ou Starlink sont concernées. Deux travailleurs et budget borné ; le temps prévu pour la maintenance est ajusté au temps restant du passage. Déduplication par créneau, verrou base par routeur, lectures seules. Les graphiques natifs MikroTik s’activent explicitement depuis l’onglet historique, pour les seules interfaces configurées et un accès privé. Ne pas ouvrir le service web à Internet.

## Interface
Onglet Historique accessible même hors ligne : sélection de liaison et 24h/7j/30j/période personnalisée, courbes RX/TX et sessions connectées/actives, volumes par intervalle et total de la période, états et liste des événements. Affichage UTC explicite. Agrégation horaire pour longues périodes et export CSV des relevés bruts. États chargement, erreur, vide et absence de mesures distingués.

## Validation
Tests arithmétiques de réinitialisation, horloge, trous et activité ; tests lecteur RouterOS et activation graphing idempotente ; tests autorisation et bornes de requête ; migration embarquée et miroir SQL ; typecheck, lint, tests et aperçu navigateur isolé. Aucun trafic de test ni restriction ne doit être appliqué aux routeurs par la collecte.

## Exploitation et limites
- Le cron existant `/api/cron/router-health-check` déclenche la collecte ; aucun nouveau timer à installer. Réseau ou API injoignable et dépassement du budget restent des lacunes visibles. Le budget de collecte est 90 secondes avec deux connexions au plus ; les nouveaux routeurs passent en premier, puis ceux du relevé le plus ancien.
- La précision des événements automatiques est celle des relevés (5 minutes nominales), pas une détection à la seconde. Une API muette ne prouve pas une panne Internet ; seuls les liens réellement arrêtés sont identifiés automatiquement comme indisponibles.
- Le fournisseur Starlink n’est pas interrogé par une API de télémétrie dans cette version. Les confirmations/suspicions fournisseur sont consignées par l’administrateur avec leur référence et identifiées comme déclarations.
- L’activation des graphiques locaux se fait par routeur depuis l’onglet Historique, après choix du réseau privé autorisé. La collecte centrale n’attend pas cette activation et n’ouvre aucun service réseau.
- Aucune purge programmée des échantillons ; période maximale de consultation/export : 31 jours, historiques plus anciens accessibles en changeant les dates. Totaux exclusifs des intervalles commençant avant la période, et couverture indiquée.
