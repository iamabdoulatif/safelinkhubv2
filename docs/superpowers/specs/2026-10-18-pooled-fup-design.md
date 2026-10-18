# FOUANGA : enveloppe cumulée et tickets 2M/2M

Conception demandée explicitement par le propriétaire : E1 5 To + E2 5 To = enveloppe de gestion de 10 To ; aucun bridage de profil commercial sous 2M/2M. Ce débit est un plafond configuré par ticket, jamais une garantie simultanée contre le plafond partagé.

Mode optionnel par routeur, sans changer le FUP individuel existant de KONGASSO. La consommation et la réserve sont additionnées avant la décision : un WAN en réserve ou ayant dépassé son enveloppe ne suspend plus tout le site tant que le solde cumulé est positif. Les compteurs, références et dates restent séparés. Le volume cumulé est une politique SaaS, sans transfert contractuel de quota entre abonnements Starlink.

Le budget quotidien cumulé est étalé jusqu’au prochain changement de cycle à confirmer, avec marge de 20 %. La réception et l’envoi se partagent ce budget à parts égales. Le FUP réduit le plafond partagé, pas les profils sous 2M/2M. Le solde cumulé restant doit être confirmé et frais ; une fin de cycle, un redémarrage ou une incohérence exige un rapprochement avant reprise, sans crédit automatique des deux abonnements.

Garde-fou local : somme des deltas WAN, pas arrêt sur le seul Standard ; conserve 1 Go par WAN comme marge. Sauvegarde et propriété des ressources identiques au moteur existant. Conserver le mode désactivé choisi par le propriétaire jusqu’à une activation explicite.

Appliquer aux profils commerciaux actuels au moins 2M/2M, hors profil technique de paiement. Ajouter un partage PCQ permanent par IP pour les sessions déjà ouvertes et exclure les connexions marquées WAN de FastTrack. Le partage reste après retrait du FUP. Sauvegarder l’état avant intervention, contrôler CPU/compteurs et ne pas déconnecter les comptes HotSpot.
