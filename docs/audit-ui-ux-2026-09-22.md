# Audit UI/UX — SafeLinkHub (22 septembre 2026)

Méthode : captures réelles des pages publiques (desktop 1440 px + mobile 390 px, défilement complet pour déclencher les animations `reveal`), rendu du vrai `DashboardView` avec données simulées via un banc d'essai temporaire, et lecture du code des pages admin protégées (sidebar, vouchers, users, settings, routeur, formations).

## Verdict global

Le socle est solide : charte Slate/lime cohérente, hiérarchie typographique claire, sidebar admin groupée par métier et repliable (6 groupes, un seul ouvert), dashboard organisé en « action d'abord, chiffres ensuite », accessibilité soignée (focus trap du drawer mobile, tableaux de secours sous les graphiques, `prefers-reduced-motion` respecté). Les problèmes trouvés sont ponctuels, pas structurels.

## Problèmes corrigés dans cette session

### P1 — /formations : trois fonctionnalités empilées sur une même page
La page Formations cumulait 8 sections : hero + recherche, arguments, thèmes, parcours, articles de blog, « Qui écrit », **témoignages + formulaire de soumission d'avis**, CTA final. Le formulaire « Partagez votre témoignage » n'a rien à faire sur une page d'apprentissage : il allonge la page, dilue l'objectif (s'inscrire à un parcours) et duplique la vitrine d'avis de la landing.
**Correction :** section `Testimonials` retirée de /formations (elle reste sur la landing, seul endroit où elle convertit). La page passe de 8 à 7 sections, toutes orientées contenu.

### P2 — Dashboard : montants illisibles dans les tuiles KPI
Les tuiles affichaient « 4821500 FCFA » en toutes lettres : sept chiffres collés, impossibles à lire d'un coup d'œil — c'est précisément le désordre ressenti sur l'écran d'accueil du dashboard.
**Correction :** format compact au-delà du million (« 4,8 M FCFA »), valeur exacte conservée au survol (`title`) et dans les écrans de détail. Appliqué aux 5 tuiles monétaires (Encaissé, Revenu net, Commissions, Dépenses, Crédit portefeuille).

### P3 — /admin/vouchers : prix formatés en anglais dans une UI française
`formatPrice` utilisait `toLocaleString("en-US")` et préfixait la devise : « FCFA 1,000 » au milieu d'une interface française.
**Correction :** « 1 000 FCFA » (espace fine insécable, devise suffixée), cohérent avec le reste de l'admin.

## Recommandations (non appliquées — à valider)

### R1 — Landing mobile : 15 200 px de hauteur, 13 sections
Sur desktop la page tient ~9 700 px, ce qui reste défendable pour une page de conversion. Sur mobile elle dépasse 15 000 px : le taux d'abandon avant la FAQ et le CTA final est quasi certain. Piste : masquer sur mobile les sections secondaires (BlogTeaser, une des deux FeatureSplits) ou les condenser en accordéons. Changement de stratégie contenu — à décider par vous.

### R2 — Six histogrammes mensuels visuellement identiques
Les six cartes « six derniers mois » utilisent la même couleur lime et la même silhouette : on les confond au premier regard. Piste : deux teintes (lime pour la monnaie, ardoise pour les compteurs) ou regrouper en 3 cartes à deux séries. Le code montre que la couleur unique est un choix assumé — d'où simple recommandation.

### R3 — /admin/settings/general : textes en dur en français
La page ignore le dictionnaire i18n : un utilisateur anglais voit « Configuration routeur », « Walled-garden », etc. Les autres pages admin passent par `getAdminDict`. À aligner.

### R4 — /blog renvoie 500 quand la base est injoignable
La page blog ne survit pas à une panne de base (constaté en local sans `DATABASE_URL`), contrairement à /formations qui a un repli défensif (`safePosts`). Piste : même garde-fou sur /blog.

## Points forts à conserver

- Sidebar admin : groupes métier repliables, un seul ouvert, badge de demandes en attente, sous-navigation KYC en contexte.
- Dashboard : bandeau routeurs hors ligne nommé et cliquable AVANT les chiffres ; tuiles toujours liées vers leur écran de détail.
- Système `reveal` : aucun contenu masqué sans JS, filets de sécurité ciblés, compteurs animés avec restitution du texte serveur.
- Pages publiques : hero mobile impeccable, pages Contact et Login propres et focalisées, page Boutique autonome volontaire (commentaire assumé dans le code — respectée).
