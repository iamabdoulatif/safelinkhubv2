# FUP Starlink par liaison

## Exploitation

La fiche routeur → Régulation propose un FUP séparé par abonnement. Un quota
de 5 To signifie ici **5 000 Go décimaux**, dont 500 Go de réserve ; ce quota
est une enveloppe de gestion, pas une affirmation sur les conditions du forfait
Starlink. Une restriction pour usage commercial doit être traitée avec Starlink.

Cycles confirmés par l'exploitant le 17 octobre 2026 (borne de fin exclusive UTC) :

| Site | Interface | Début | Fin exclusive |
| --- | --- | --- | --- |
| FOUANGA Standard | E1-WAN-FAI | 21 septembre | 21 octobre |
| FOUANGA Mini | E2-WAN-FAI | 10 octobre | 10 novembre |
| KONGASSO | E1-WAN-FAI | 3 octobre | 3 novembre |

Derniers volumes communiqués : Standard 4 800 Go, Mini 2 130 Go, KONGASSO
6 150 Go. Ce sont des relevés manuels arrondis, pas des mesures actuelles
automatiquement importées dans la base. L'écran rapproche chaque relevé récent
avec un compteur brut WAN et l'uptime du routeur. Après reboot ou changement
de cycle, refaire ce rapprochement ; aucun crédit n'est recréé silencieusement.

## Application

- Activer le FUP depuis son écran dédié, après vérification des références.
  Le bouton historique n'active pas ce mode. L'ancienne cascade punitive est
  verrouillée sur un site FUP et ne s'exécute plus via le cron.
- La plateforme calcule le débit partagé conservateur : minimum des budgets
  journaliers des liaisons, converti en bit/s, avec 20 % de marge pour les écarts de comptage et le trafic hors HotSpot. Un basculement
  de trafic vers le Standard ne peut donc pas exploiter le budget du Mini.
  Ce choix sous-utilise volontairement la capacité disponible ; il ne constitue
  pas un équilibrage WAN optimisé.
- Une file partagée PCQ couvre toutes les interfaces HotSpot. Ses plafonds
  directionnels totalisent le budget : 20 % envoi et 80 % réception. La part
  inutilisée dans un sens ne passe pas dans l’autre. Le contrôle porte sur les
  compteurs WAN réels, pas seulement sur le compteur « total » de la file. En réserve,
  chaque adresse reçoit au plus 128 kbit/s en émission et 256 kbit/s en réception,
  sous le plafond partagé. Aucun ticket n'est désactivé et aucun bannissement
  permanent n'est créé. Les détections individuelles n8n restent des propositions.
- Le script local vérifie chaque WAN toutes les 5 secondes et garde 1 Go
  supplémentaire. Quand une liaison n'a plus cette marge, les règles de la
  chaîne `forward` suspendent l'accès Internet sur les WAN gérés, pour les deux
  familles IP. Le portail local et l'administration du routeur en `input` ne sont
  pas bloqués. Cela ne garantit pas exactement le volume facturé par Starlink :
  ses relevés peuvent être différés, arrondis et compter du trafic différent.
- Une tâche de démarrage séparée suspend le trafic Internet après un reboot ;
  les contrôles locaux ne peuvent jamais rétablir le crédit ou rouvrir le trafic.
  La plateforme exige un rapprochement avant de lever cette protection.
  La fin d'un cycle ne réinitialise pas automatiquement le crédit.
  L'exploitant confirme le nouveau cycle et sa référence puis relance le FUP.
- FastTrack est désactivé et ses connexions existantes fermées ; les premiers
  flux clients peuvent se reconnecter. Une sauvegarde binaire du routeur précède
  la première pose. Une première installation en échec tente une dépose ciblée
  et rétablit les règles FastTrack initialement actives. Une mise à jour en échec
  conserve la protection précédente et doit être diagnostiquée.
- La désactivation FUP dépose uniquement ses ressources et rétablit FastTrack.
  Elle ne modifie pas les tickets ou les autres règles de filtrage.

L'horloge UTC doit être à moins d'une minute du serveur et la charge CPU sous
80 % avant la pose. Le script est compilé sur le routeur avant les modifications
de trafic ; les règles et le plafond sont relus après application.

## Contrat n8n

`GET /api/internal/n8n/regulation/routers` inclut les sites FUP même en
observation. `fupLinks` contient chaque interface et son cycle ; `/read` renvoie
`links[]` avec compteur confirmé, horodatage, cumul de cycle et budget. Les
écritures du ledger sont sérialisées par verrou de ligne PostgreSQL.

Le nœud Décision reste une simulation. Son objet `apply` (`dryRun: true`,
`observationOnly: true`, `state.fupV2`, `watch`) est envoyé à `/enforce` sous
la forme `{ observation: objetApply, execute: true }` :
ce point d'entrée stocke l'observation, puis applique uniquement la politique
déjà activée dans SafeLinkHub, recalculée côté serveur. Le corps de la requête
ne peut ni activer un site ni soumettre des commandes RouterOS. `/observe`
stocke sans appliquer ; l'ancien `/apply` refuse les sites v2 et les simulations.

Le cron interne assure aussi le passage, avec le même verrou et le même moteur
que n8n. Un chevauchement ne double pas la consommation. Les alertes n8n doivent
tester la réponse `/enforce` (`applied && changed`) et utiliser son texte
`telegram`/`email`, pas celui de la simulation. Le récap quotidien affiche le
mode et le dernier résultat d'application connu.

## Livraison

Migration additive `0016_starlink_fup_links`, exécutée au démarrage. Les sites
restent dans leur état actuel tant que le FUP n'est pas configuré puis activé.
Utiliser la CI normale sur `main` et le déploiement GHCR avec rollback ; ne pas
livrer une branche de test sous le tag `latest`. Vérifier les migrations,
configurer les liaisons en observation, rapprocher les compteurs, puis activer
et relire l'état du routeur. Conserver la sauvegarde pré-FUP.

## Mode cumulé optionnel — 18 octobre 2026

`router_regulation.fup_pooled` vaut false par défaut. Pour FOUANGA, le propriétaire demande 5 000 + 5 000 Go comme enveloppe SaaS : usage, réserve et arrêt sont calculés sur la somme, pas sur le kit le plus consommé. `read.pool` expose le calcul serveur à n8n ; les scripts testés de décision et récapitulatif sont dans `pooled-decision.js` et `pooled-recap.js`.

Le budget prend le solde cumulé jusqu’à la dernière fin de cycle, avec marge de 20 %, et le répartit moitié envoi/moitié réception. La réserve cumulée est un seuil d’alerte, sans retenue supplémentaire de volume. Les PCQ du mode cumulé restent à 2M/2M par adresse en réserve ; le débit réel reste soumis au plafond partagé. Les cycles et baselines restent distincts, sans crédit simultané automatique ; une fin de cycle, référence périmée ou un redémarrage impose un rapprochement. Le garde-fou local additionne les deltas des WAN, conserve 1 Go de marge par membre et ne bloque plus sur le seul volume du Standard. Les restrictions propres aux contrats Starlink ne sont pas transférables par cette enveloppe logique.

`installTicketFairness` est une installation opérationnelle explicite, exécutée après retrait du FUP. Elle sauvegarde le routeur, pose un PCQ permanent par IP à 2M/2M sans plafond global, relève les profils commerciaux sous 2M/2M, conserve les profils déjà supérieurs et exclut le profil technique `slh-paiement`. Elle limite FastTrack aux connexions sans marque et purge les anciennes connexions FastTrack pour que le partage et le routage prennent effet. Les comptes HotSpot ne sont pas déconnectés, mais des sessions applicatives peuvent se reconnecter après purge. Ce partage persiste après désactivation du FUP ; son retrait est une opération distincte. Ne pas l’installer par-dessus un FUP actif.

La stratégie individuelle existante reste inchangée pour KONGASSO et les autres routeurs sans option cumulée.
