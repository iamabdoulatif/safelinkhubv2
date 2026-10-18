# Telegram des organisations — exploitation

L’assistant est dans `/admin/settings/notifications`. Guide client imprimable : `/guides/telegram-notifications.html`.

## Liaison et confidentialité

Les administrateurs configurent uniquement leur organisation de session. Les noms de bots sont lus avec `getMe`, les tokens sont chiffrés par AES-GCM avec la clé existante AUTH_SECRET. Aucun token, même chiffré, ne figure dans le modèle envoyé au navigateur ou à n8n. Le bot ID est unique entre organisations.

La liaison automatique est réservée à un bot dédié, avec consentement visible. Elle vérifie l’absence de webhook sans le supprimer et lit les messages par `getUpdates`. Un code aléatoire de 256 bits, stocké haché, expire après dix minutes ; la confirmation est réservée à l’administrateur qui a initié la liaison. Les conversations de groupe sont exclues de cette version. Le mode avancé vérifie une conversation privée par `getChat` et requiert confirmation et test. Un changement de token ou de destinataire révoque le test et l’activation précédente.

Un bot déjà piloté par long polling par un autre service peut provoquer une erreur de conflit ; la plateforme demande alors un bot dédié. Aucun traitement ne doit supprimer son webhook ou son intégration existante.

## Circuit des alertes

Le cron serveur existant `/api/cron/router-health-check` déclenche une tâche Telegram indépendante des réservations des sondes de routeurs. Il ne requiert pas de nouveau secret ni de nouveau cron. Les événements FUP validés en base et les relevés de quota frais alimentent une boîte d’envoi propre à chaque organisation. Le cron de régulation serveur continue à appliquer le FUP des clients.

Le workflow n8n historique utilise le bot du superadmin. Sa liste `/api/internal/n8n/regulation/routers` est désormais limitée aux organisations qui possèdent un superadmin : les routeurs clients ne sont pas envoyés à ce circuit. Les notifications clients passent directement par leur token côté serveur ; aucun credential n8n par client n’est nécessaire. Les organisations du superadmin qui configurent aussi leur propre bot peuvent recevoir les deux circuits, volontairement indépendants.

Les préférences couvrent changements de niveau appliqués, réserve/épuisement du quota, levée des limites et bilan quotidien facultatif après 07 h UTC. Une levée des limites est décrite comme telle, sans prétendre que Starlink a renouvelé son quota. Un routeur sans liaison FUP ne génère pas de bilan ni d’alerte de quota.

## Fiabilité

Un verrou consultatif Postgres par organisation sérialise configuration et livraison, même entre processus. La clé organisation/événement déduplique les passages répétés. Les réglages changent de révision : les envois en attente d’une ancienne révision sont annulés. Le budget d’un passage est de 45 secondes, avec au maximum trois envois par organisation, et rotation par date de dernier traitement.

Une erreur temporaire est reprise au maximum cinq fois avec temporisation croissante et prise en compte de retry_after. Une erreur permanente désactive les alertes et apparaît dans les réglages. Les tokens et descriptions brutes de Telegram ne sont pas journalisés. L’historique est conservé 90 jours. Comme avec tout envoi externe sans clé d’idempotence Telegram, une rupture réseau après réception par Telegram mais avant acquittement en base peut exceptionnellement entraîner un doublon lors d’une reprise.

Une activation ou une modification des préférences démarre une nouvelle fenêtre de changements appliqués, sans réexpédier tout l’historique. Les avertissements de quota sont dédupliqués par liaison, cycle et niveau. Le bilan quotidien est dédupliqué par routeur et jour UTC.

## Vérification

Tests purs et rendu : `npx tsx --test src/lib/notifications/telegram.test.ts src/app/admin/settings/notifications/TelegramSettings.test.tsx`.

Intégration PostgreSQL avec schéma temporaire nettoyé automatiquement : `TEST_DATABASE_URL=postgresql://localhost/postgres npx tsx --test src/lib/notifications/telegram.integration.test.ts`. Les transports Telegram sont simulés, aucun message réel n’est envoyé.
