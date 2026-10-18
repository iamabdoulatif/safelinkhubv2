# Multi-WAN Premium — 30 000 FCFA par routeur

## Décisions utilisateur
Générateur fonctionnel comparable à darilangit.com/gabung-isp : RouterOS 6/7, 2–6 WAN, interfaces et passerelles, PCC et failover local/récursif/hybride, aperçu/copier/télécharger. Paiement unique de 30 000 FCFA par routeur, régénérations incluses. Charte Slate de SafeLinkHub et français.

## Architecture
Nouvel onglet Multi-WAN Premium sur la fiche de chaque routeur, disponible hors ligne. Formulaire et résumé accessibles avant paiement ; script généré exclusivement côté serveur après vérification d’une licence organisation+routeur. Aucun script payant n’est envoyé dans le HTML, le navigateur ou un appel non autorisé. Copie et export .rsc après achat. La licence ne s’étend pas aux autres routeurs ni à une nouvelle organisation en cas de transfert. Aucun droit gratuit implicite du superadmin.

## Paiement
Montant serveur constant 30 000 FCFA. Choix explicite portefeuille FCFA ou SafeCoin, conversion au taux courant affiché avant validation ; refus si le taux a changé. Débit, licence et audit dans une même transaction PostgreSQL, verrou par organisation et ligne routeur, unicité org+routeur et référence de paiement. SafeCoin : verrou du compte, solde dénormalisé et ledger débités dans la transaction. Paiement uniquement par administrateur ou éditeur habilité routeurs. Aucune dépense réelle durant les tests.

## Générateur et compatibilité
Moteur original, entrées strictement validées et citées/échappées pour RouterOS. PCC pour LAN routé uniquement ; le Hotspot utilise la table principale selon MikroTik, et dispose donc d’un mode basculement sans PCC. Aucun débit unique n’est annoncé comme somme des WAN : PCC répartit les connexions. Le choix hybride vérifie la passerelle et deux cibles publiques distinctes par WAN ; récursif utilise une cible et local seulement la passerelle. Chaque table PCC contient les routes de secours des autres WAN.
Précontrôles avant toute écriture : version 6/7 conforme, interfaces présentes, passerelles distinctes des sondes et LAN, pas de chevauchement WAN/LAN ; PCC refusé sur interface Hotspot et en présence de FastTrack actif. Configuration limitée aux routes/NAT/mangle portant le préfixe propre au routeur, DNS et filtres existants conservés. Aucune installation automatique sur appareil réel. Le fichier contient les étapes de vérification et la procédure de retrait des objets appartenant au module.

## Tests
Cas de 2 à 6 WAN, les deux versions et trois modes ; injection/duplicats/adresses invalides, secours dans chaque table, vrai comportement hybride, contrôles FastTrack/Hotspot avant mutations, noms propres à chaque routeur. Tests paiement concurrents, même organisation sur plusieurs routeurs, manque de solde, changement de taux, rollback et accès inter-org. Migration embarquée + SQL miroir. Typecheck, lint, suite tests, aperçu navigateur desktop/mobile ; pas de facturation client ni exécution réseau réelle.

## Références primaires
https://help.mikrotik.com/docs/spaces/ROS/pages/152600617/Per+connection+classifier
https://help.mikrotik.com/docs/spaces/ROS/pages/26476608/Failover+WAN+Backup
https://help.mikrotik.com/docs/spaces/ROS/pages/59965508/Policy+Routing
