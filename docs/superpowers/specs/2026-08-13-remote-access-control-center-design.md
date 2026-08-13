# Centre de contrôle des accès distants — conception

**Date :** 13 août 2026
**Statut :** validé pour planification
**Portée :** refonte de `/admin/remote-access` pour la gestion d'un parc de routeurs MikroTik.

## Décision

La page « Accès distant » devient un **centre de contrôle opérationnel**. Elle permet à un responsable de parcourir l'état de son parc, de repérer immédiatement une action requise et d'inspecter les accès d'un routeur sans perdre la vue d'ensemble.

La direction validée conserve cinq capacités :

1. une bande d'alerte prioritaire, visible avant la liste ;
2. des métriques distinctes pour la disponibilité, les accès actifs, les vérifications et les actions requises ;
3. une table de routeurs lisible en une ligne ;
4. un panneau de détail latéral pour le routeur sélectionné ;
5. une recherche globale et des filtres adaptés à un parc conséquent.

## Problème à résoudre

L'écran actuel juxtapose installation de tunnel, Back To Home, accès direct, Bypass IPv6 et remplacement du routeur dans une longue page. Il oblige l'utilisateur à faire défiler, puis à reconstruire mentalement le statut de chaque routeur avant de pouvoir agir.

La nouvelle page doit répondre, en quelques secondes, à trois questions :

- Quels routeurs et accès sont fonctionnels ?
- Quel élément demande une intervention maintenant ?
- Comment inspecter ou administrer les accès d'un routeur précis ?

## Utilisateurs et priorités

| Utilisateur | Besoin prioritaire | Réponse de l'interface |
| --- | --- | --- |
| Propriétaire d'organisation | Vérifier son parc sans expertise réseau poussée | Indicateurs simples, terminologie stable, action prioritaire expliquée. |
| Technicien terrain / support | Ouvrir ou contrôler un routeur rapidement | Recherche, table dense et panneau de détail qui évite une navigation supplémentaire. |
| Superadmin | Comprendre les situations sensibles et l'audit | États explicites, accès aux détails, actions sensibles confinées aux espaces autorisés. |

## Architecture de l'écran

### En-tête applicatif

L'en-tête conserve l'identité SafeLinkHub, le sélecteur d'organisation, la recherche globale, les notifications et le menu de compte. La recherche accepte le nom du routeur, le client, une adresse publique ou le type de service ; le raccourci `⌘/Ctrl + K` est affiché mais non indispensable.

### Navigation latérale

La navigation reste stable à gauche. « Accès distant » est l'item actif dans le groupe Réseau. Les autres domaines ne sont pas dupliqués dans le contenu de la page. La navigation se replie en mode mobile afin de réserver la largeur aux informations du parc.

### En-tête de page

Le titre « Accès distant » est suivi d'une phrase courte expliquant l'objectif. L'action primaire, **Installer un tunnel**, ouvre le parcours d'installation existant dans un flux guidé : choix du routeur, contrôle des prérequis, génération du script à usage unique, confirmation de connexion.

Le bouton primaire ne sert pas à activer un accès direct ou à remplacer un routeur : ces actions restent contextualisées dans le détail du routeur afin d'éviter une opération sur le mauvais équipement.

### Indicateurs de situation

Quatre cartes sont visibles sans défilement sur bureau :

| Carte | Valeur | Règle de calcul |
| --- | --- | --- |
| Routeurs en ligne | `connectés / total` | Dernier heartbeat tunnel ou routeur connu. |
| Accès actifs | total | Services publiés et non expirés, quel que soit l'état instantané du routeur. |
| À vérifier | total | Routeurs hors ligne, tunnel dégradé ou prérequis manquant. |
| Actions requises | total | État qui empêche une opération attendue ou impose une décision utilisateur. |

Les couleurs soutiennent les libellés mais ne constituent jamais la seule information : vert pour opérationnel, ambre pour vérification, rouge pour action requise, gris pour indisponible ou inconnu.

### Bande « action requise »

Sous les métriques, une seule bande résume l'incident le plus prioritaire. Elle nomme le routeur, l'état et la conséquence concrète : par exemple, « HSPT-TOFESSO est hors ligne depuis 47 min : les accès restent actifs, mais indisponibles ».

S'il n'existe aucune priorité, cette bande disparaît ; elle n'est pas remplacée par une fausse alerte verte. S'il en existe plusieurs, elle affiche le nombre et le bouton « Voir les incidents » applique le filtre correspondant à la table. La priorité est déterminée ainsi : blocage de sécurité, échec de remplacement ou d'installation, routeur/tunnel hors ligne, puis prérequis manquant.

### Table du parc

La table est la surface principale. Chaque ligne comporte :

- état du routeur (pastille et libellé), nom, propriétaire ou site ;
- type et état de tunnel ;
- nombre d'accès actifs ;
- état opérationnel ;
- menu d'actions contextuelles.

Un clic n'ouvre pas une nouvelle page : il sélectionne la ligne et affiche le panneau de détail. La ligne sélectionnée est marquée par un fond discret et une barre bleue latérale. Un double clic n'a pas de signification distincte.

La recherche filtre par nom de routeur, client, organisation, adresse/port et service. Les filtres disponibles sont : état du routeur, état du tunnel, type de tunnel, présence d'accès actifs, action requise et date d'expiration proche. Ils sont cumulables et restent visibles sous forme de jetons supprimables. Les critères actifs sont conservés uniquement pendant la session de navigation.

La table est triée au départ par priorité opérationnelle, puis par nom. L'utilisateur peut trier par nom, dernier contact, nombre d'accès actifs et date d'expiration la plus proche. Elle utilise pagination ou chargement progressif côté serveur pour ne pas charger un parc complet dans le navigateur.

### Panneau de détail

Sur écran large, le panneau droit reste à côté de la table. Il présente le routeur sélectionné, son dernier contact et l'état tunnel avant toute action.

Il liste ensuite les services disponibles : WinBox, WebFig, SSH/SFTP et MikHmon. Chaque ligne expose le type de service et son endpoint public ; l'action de copie est indépendante et affiche une confirmation non intrusive. Une URL WebFig ou MikHmon peut proposer l'ouverture dans un nouvel onglet après confirmation explicite.

Le panneau termine avec les événements pertinents récents : création ou vérification du tunnel, copie/révélation d'accès autorisée, changement de disponibilité et opérations de remplacement. Aucun mot de passe, jeton de script ou clé privée ne figure dans ce flux.

Le bouton « Ouvrir l'espace routeur » mène à la vue détaillée existante. Les opérations coûteuses ou irréversibles — activation d'accès direct, Bypass IPv6, remplacement, révocation — ouvrent une confirmation avec le routeur clairement rappelé.

Sur tablette et mobile, le panneau devient un panneau latéral plein écran ou une feuille inférieure. La sélection, les filtres et le retour à la liste sont conservés.

## États, erreurs et sécurité

| Situation | Traitement UI |
| --- | --- |
| Données en chargement | Squelettes pour métriques, lignes et panneau ; aucune valeur inventée. |
| Aucun routeur | État vide avec l'action « Installer un tunnel ». |
| Aucun résultat filtré | La table garde son en-tête et propose d'effacer les filtres. |
| Routeur hors ligne | État explicite, dernière activité connue, actions nécessitant une connexion désactivées avec explication. |
| Droits insuffisants | Le routeur peut être visible seulement si l'utilisateur y est autorisé ; toute action indisponible explique le rôle requis sans divulguer de secret. |
| Endpoint copié | Toast de confirmation ; aucune donnée secrète n'est enregistrée dans l'interface. |
| Action risquée | Confirmation modale nommant le routeur, la conséquence et la possibilité d'annuler. |

Les identifiants RouterOS, mots de passe, scripts de tunnel, jetons et clés privées restent hors de la réponse de liste et du HTML initial. Leur révélation suit le coffre VPN et l'audit déjà définis dans `2026-07-22-reprise-acces-vpn-design.md`. Un endpoint public de connexion peut être affiché et copié ; toute révélation d'identifiant associée demeure une action serveur explicitement autorisée et auditée.

## Données nécessaires

La vue de liste consomme une projection de parc, pas les objets secrets complets. Par routeur, elle requiert : identifiant, nom, organisation/site, état de connexion, dernier contact, type/état tunnel, nombre de services actifs, type d'incident le plus grave et date d'expiration la plus proche.

Le détail chargé à la sélection ajoute les services non secrets (type, endpoint, état, expiration), les actions réalisables selon les autorisations et les événements d'audit résumés. Les adresses, identifiants et secrets sensibles ne sont récupérés qu'au moment précis où la politique du coffre l'autorise.

## Design system et accessibilité

- Surface claire, bordures gris-bleu légères, jaune SafeLinkHub réservé à la navigation active et aux signaux d'attention non critiques.
- Bleu réservé à la sélection, au focus et aux actions de navigation ; rouge réservé au danger et non aux simples indisponibilités.
- Corps de texte au minimum 14 px dans le produit réel ; les textes secondaires conservent un contraste AA.
- La table est navigable au clavier ; `Entrée` ou `Espace` ouvre le détail de la ligne focalisée.
- Le panneau est identifié, peut être fermé avec `Échap` et restitue le focus à la ligne d'origine.
- Les icônes disposent d'un libellé accessible et chaque état combine icône, texte et couleur.

## Hors périmètre

- Reconcevoir le contenu technique interne de WireGuard, OpenVPN, Back To Home, Bypass IPv6 ou remplacement ; ces opérations gardent leurs flux spécialisés.
- Créer de nouveaux droits, nouveaux abonnements, nouveaux endpoints ou modifier les règles de sécurité réseau.
- Afficher ou stocker des clés privées, scripts réutilisables ou mots de passe dans les listes, caches client ou événements d'interface.

## Critères d'acceptation

1. Un utilisateur voit, sans ouvrir de détail, la disponibilité du parc, le volume d'accès actif et le nombre d'éléments à traiter.
2. L'incident le plus grave est visible avant la table et le filtre correspondant est activable en un clic.
3. Un clic sur une ligne conserve la table et ouvre les accès du routeur sélectionné dans un panneau latéral sur bureau.
4. Chaque ligne expose un état textuel de routeur et tunnel, un nombre d'accès et le propriétaire/site ; la couleur seule ne porte jamais le sens.
5. La recherche et les filtres permettent de retrouver un routeur par nom, client, endpoint ou service sans recharger la page complète.
6. Les actions indisponibles expliquent leur prérequis ; les actions critiques demandent une confirmation contextualisée.
7. Aucun secret n'est envoyé dans la projection de liste ou inscrit dans la sortie d'audit visible.
8. La page reste utilisable au clavier, sur écran étroit et avec les états de chargement, vide ou erreur.
