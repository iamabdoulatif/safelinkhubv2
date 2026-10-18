# Connecter les alertes Telegram à SafeLinkHub

Document de conception et guide du parcours proposé — 18 octobre 2026.
Conception approuvée par le propriétaire le 18 octobre 2026. Guide client livré dans `/guides/telegram-notifications.html` ; exploitation décrite dans `docs/n8n/telegram-clients.md`.

## Le parcours recommandé

Dans Paramètres > Notifications > Telegram, l’administrateur de l’organisation choisit « Utiliser mon bot ».

1. Ouvrir le compte officiel @BotFather : https://t.me/BotFather.
2. Envoyer /newbot et choisir le nom puis le nom d’utilisateur du bot en suivant les instructions de Telegram.
3. Copier le token fourni par BotFather dans le champ sécurisé de SafeLinkHub. Ne jamais le partager dans une conversation ou une capture publique.
4. Cliquer sur « Vérifier mon bot ». SafeLinkHub vérifie le token et affiche automatiquement le nom et le nom d’utilisateur du bot.
5. Cliquer sur « Connecter mon Telegram ». Un lien personnel temporaire ouvre ce bot dans Telegram. Appuyer sur « Démarrer ».
6. Revenir dans SafeLinkHub, vérifier le destinataire détecté et confirmer la liaison. Le Chat ID est rempli automatiquement.
7. Cliquer sur « Envoyer un test », puis activer les alertes souhaitées.

Aucun compte n8n ni outil externe de recherche de Chat ID n’est nécessaire pour le client. La création du bot requiert une étape dans Telegram avec BotFather dans ce parcours ; SafeLinkHub guide l’utilisateur.

## Les informations affichées

- Nom du bot : récupéré automatiquement, non obligatoire à saisir.
- Token : saisi une fois, conservé chiffré, jamais réaffiché.
- Destinataire et Chat ID : détectés lors de la liaison, confirmation obligatoire.
- État : non configuré, en attente de liaison, connecté, erreur.
- Actions : tester, remplacer le token, changer le destinataire, déconnecter.

La saisie manuelle du Chat ID reste disponible dans « Configuration avancée ». Elle doit également être suivie d’un test et d’une confirmation du destinataire.

## Alertes proposées

Activation ou changement de niveau FUP, quota proche de l’épuisement, quota épuisé, restauration confirmée après renouvellement, et bilan quotidien facultatif. Le client choisit ses routeurs et ses alertes dans les limites de son organisation.

Le renouvellement ne doit pas produire une restauration annoncée sans confirmation réelle de l’état du quota et du routeur.

## Fonctionnement côté plateforme

Les réglages sont rattachés à une organisation, modifiables uniquement par ses administrateurs autorisés. Le serveur détermine le propriétaire de chaque routeur ; un identifiant transmis par le navigateur ne suffit pas à autoriser une lecture ou un envoi.

La vérification du token utilise getMe. La liaison utilise un paramètre start aléatoire, à usage unique et à expiration courte. Le serveur associe uniquement le message /start contenant ce paramètre à la demande authentifiée correspondante. Il ne choisit jamais simplement le dernier utilisateur ayant écrit au bot.

Pour un bot dédié sans webhook, la récupération des mises à jour peut être limitée à la phase de liaison. Si un webhook existe déjà, ne pas le supprimer : expliquer le conflit et proposer la configuration avancée ou un bot dédié. getUpdates et webhook ne peuvent pas être utilisés simultanément.

Les envois passent par le serveur SafeLinkHub : n8n déclenche l’événement, le serveur choisit les réglages de l’organisation et appelle Telegram. Les tokens des clients ne sont pas transmis à n8n. Un même bot ne doit pas être enregistré par plusieurs organisations sans un modèle explicite de partage, hors périmètre initial.

Les alertes opérationnelles du superadmin restent un canal distinct. Ne pas recopier automatiquement les notifications ou les données d’un client vers ce canal.

Prévoir déduplication par événement et destinataire, file d’envoi, reprises limitées en cas de panne, respect des délais Telegram, historique d’envoi sans secret et signalement visible des échecs permanents. Ne pas journaliser les URL Telegram contenant le token.

## Aide intégrée

- « Token invalide » : recopier le token depuis BotFather ou le remplacer.
- « En attente de connexion » : ouvrir le lien proposé puis appuyer sur Démarrer.
- « Lien expiré » : générer un nouveau lien depuis SafeLinkHub.
- « Bot déjà utilisé par un autre service » : utiliser un bot dédié ou la configuration avancée sans désactiver le service existant.
- « Message refusé » : vérifier que le bot n’est pas bloqué et relancer la connexion.

## Alternatives

1. Bot personnel avec assistant : recommandé pour conserver l’identité du client ; une création BotFather et un token à copier.
2. Bot SafeLinkHub partagé : encore plus simple, un bouton de liaison suffit ; tous les clients voient l’identité SafeLinkHub, isolation des destinataires à assurer côté serveur.
3. Formulaire manuel nom/token/Chat ID : facile à développer mais demande davantage de manipulations au client ; à conserver comme option avancée.

## Vérifications avant livraison

Vérifier l’isolation entre deux organisations, les droits des utilisateurs non administrateurs, le chiffrement et le masquage des secrets, l’expiration et la non-réutilisation des liens, le refus d’un mauvais code de liaison, les erreurs Telegram, l’absence de suppression d’un webhook existant et l’absence de doublons après reprise. Tester l’envoi avec consentement explicite du propriétaire du destinataire de test.

## Références officielles

- Création des bots : https://core.telegram.org/bots#how-do-i-create-a-bot
- Liens de connexion : https://core.telegram.org/bots/features#deep-linking
- API : https://core.telegram.org/bots/api#getme
- Réception des messages : https://core.telegram.org/bots/api#getupdates
