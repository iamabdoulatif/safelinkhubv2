# FUP : budget prorata et usage intensif par ticket

Demande validée : quota seul/cumulé, cycle configurable conservé en production,
volume restant réparti sur la durée restante ; bridage, puis coupure complète
cinq heures, y compris vidéos. Ne pas prétendre classifier les applications.

Le moteur FUP serveur reste l'autorité commune à cron et n8n. Ajouter une
politique par routeur et un état séparé persistant par ticket ; aucun état
punitif dans la mémoire volatile n8n. Une nouvelle session inconnue ou un
compteur remis à zéro ne produit pas de dépassement. Une sanction ne s'allonge
pas à chaque passage. Les tickets déjà désactivés ne sont jamais réactivés.

Réglages initiaux proposés, désactivés jusqu'à activation explicite par zone :
200 Mo reçus sur 15 minutes → bridage 256 kbit/s ; maintien d'un débit proche
du plafond bridé pendant 15 minutes de mesures valides → coupure cinq heures.
Ces valeurs sont éditables ; le terme usage intensif ne signifie pas fraude.
Les vidéos sont comptabilisées et peuvent déclencher ces seuils.

Enforcement : file enfant du plafond FUP pour chaque session d'un ticket bridé.
Coupure par désactivation du compte HotSpot local ; scheduler MikroTik de
rétablissement à échéance, marqué et conditionné à la propriété de la sanction.
Métadonnées sur l’ordonnanceur ; commentaire du ticket conservé sans modification. Expiry
locale + réconciliation serveur. Pas de nouvelle sanction sur compte absent,
RADIUS externe ou déjà désactivé. Restauration uniquement du même identifiant de compte et commentaire d’origine.

Ajouter l'état et les réglages à l'API existante n8n, au récap Telegram et au
SaaS, avec documentation. Tester la machine d'état, le cumul de sessions,
resets/reconnexions, la non-prolongation, l'échéance, les commandes et le rollback.
