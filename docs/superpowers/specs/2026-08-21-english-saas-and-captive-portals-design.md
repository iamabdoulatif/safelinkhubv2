# Spécification — version anglaise complète du SaaS et des portails captifs

**Statut :** architecture validée le 21 août 2026.
**Objectif :** rendre l’interface système de SafeLinkHub disponible en français et en anglais, sans dupliquer la logique métier, les règles de paiement ou les routes d’administration.

## Portée

La livraison couvre le site public et l’authentification, le SaaS connecté (administration, routeurs, roaming, accès distant, vente, finances, réglages, support, Safecoin et écrans superadmin) ainsi que le captive portal, l’achat, l’OTP, le paiement, la récupération de code et l’auto-connexion.

Les noms propres, les données créées par les opérateurs (organisation, routeur, forfait, message personnalisé et nom de réseau) et les contenus de blog déjà publiés restent dans leur langue de saisie. SafeLinkHub ne les traduit pas automatiquement. Les contrats techniques, identifiants, devises FCFA, moyens de paiement et codes Wi-Fi ne changent jamais avec la langue.

## Modèle de langue

`Locale` reste l’union fermée `"fr" | "en"`. Le français est la valeur par défaut et reste entièrement rétrocompatible avec les URL existantes.

| Espace | Source de vérité | Persistance | Priorité |
| --- | --- | --- | --- |
| Public | préfixe d’URL (`/`, `/en`) | URL partageable | URL |
| Authentification | préfixe d’URL (`/auth`, `/en/auth`) | URL puis champ de formulaire | URL |
| Admin connecté | cookie `slh_lang` | un an, `SameSite=Lax` | cookie |
| Captive portal | paramètre `lang` | propagé dans chaque URL du parcours | paramètre |

Le cookie admin n’est ni un secret ni une donnée d’autorisation. Il sert seulement à afficher la préférence choisie. Les pages publiques ne le lisent pas afin de préserver leur pré-rendu et leur cache.

## Architecture des dictionnaires

Les chaînes sont séparées par domaine afin qu’un visiteur public ne reçoive pas les milliers de chaînes du SaaS :

```text
src/lib/i18n/
├── fr.ts / en.ts               # site public
├── auth/fr.ts / auth/en.ts     # authentification
├── admin/fr.ts / admin/en.ts   # back-office, réparti par écran si nécessaire
└── portal/fr.ts / portal/en.ts # portail client et paiement
```

Le français définit la forme TypeScript de chaque dictionnaire ; l’anglais est typé contre cette forme. Une clé manquante, une interpolation de signature différente ou une clé ajoutée dans une seule langue devient une erreur de compilation.

Les composants serveur reçoivent le dictionnaire complet. Les composants client reçoivent seulement une tranche sérialisable de chaînes et de valeurs déjà interpolées : aucune fonction de dictionnaire, donnée de session ou objet de base ne traverse la frontière serveur/client. Les montants et dates passent par `Intl` avec `fr` ou `en` et le montant reste en FCFA.

## Site public et authentification

- Les pages anglaises publiques et d’authentification existent sous `/en/...`. Elles réutilisent les mêmes composants et actions que le français avec un `locale` explicite.
- Chaque formulaire d’authentification porte sa langue dans un champ caché. Lors de la création ou modification de session, l’action valide cette valeur puis pose `slh_lang` avant la redirection vers `/admin`.
- Les liens de retour, d’activation et de réinitialisation conservent le préfixe anglais. Une URL externe ou un callback non autorisé reste rejeté par les contrôles de sécurité existants.
- Les erreurs de validation, intitulés, états de chargement et e-mails affichés dans le navigateur sont traduits. Un lien ne doit jamais construire une route anglaise qui répond 404.

## SaaS authentifié

Le layout admin résout le cookie une fois, charge le dictionnaire admin et pose `lang` sur son sous-arbre. La sidebar contient un bouton Français/English qui appelle une action serveur, met à jour le cookie puis revalide le layout.

Chaque écran admin reçoit les textes de son domaine par props ou les résout côté serveur. Les libellés de navigation sont identifiés par clé stable, jamais par texte ou par URL. Les tableaux, filtres, dialogues, états vides, notifications, titres, aides, erreurs de formulaire et libellés accessibles font partie de la traduction.

Les données métier ne sont pas modifiées : traduire l’interface ne change ni profils MikroTik, ni noms de groupes roaming, ni débits, ni vouchers, ni écritures Safecoin.

## Captive portal et paiements

Le captive portal doit rester robuste dans une mini-fenêtre Wi-Fi, sur un autre téléphone que celui qui paie, et lorsque les cookies sont bloqués. Sa langue est donc portée explicitement par `lang=fr|en` plutôt que dépendre d’un cookie.

1. Chaque portail généré affiche un sélecteur français/anglais accessible avant le choix du forfait. Le choix reconstruit le lien courant avec `lang`.
2. Le générateur de modèles MikroTik injecte les deux familles de textes et transmet `lang` dans les liens d’achat, de récupération et de paiement.
3. Les pages hébergées `/portal/purchase`, `/portal/pay`, `/portal/paid` et `/portal/recover` valident `lang`, chargent le dictionnaire portal et le transmettent à leurs composants client.
4. Chaque redirection — OTP, création de commande, fournisseur de paiement, attente, récupération et retour au hotspot — conserve `lang` et le thème du portail. Un paramètre absent ou invalide revient explicitement au français.
5. Les endpoints JSON utilisent des codes d’erreur stables (`INVALID_LINK`, `PAYMENT_UNAVAILABLE`, `PAYMENT_FAILED`, par exemple) ; les interfaces transforment ces codes en textes localisés. Les clients existants qui lisent encore `error` conservent un message français de repli pendant la migration.
6. L’auto-connexion RouterOS reste strictement inchangée : seule la copie affichée est localisée, jamais l’URL de login, le code ou l’adresse MAC.

Les anciens modèles de portail continuent de fonctionner en français si aucune information de langue n’est disponible.

## Accessibilité et sûreté

- Chaque sous-arbre rendu dans une autre langue porte `lang="en"` ou `lang="fr"` pour les lecteurs d’écran.
- Les boutons de changement de langue ont un libellé accessible dans la langue affichée et ne reposent pas seulement sur un drapeau.
- La sélection de langue ne modifie aucune autorisation, transaction ou session RouterOS.
- La valeur de locale est toujours validée contre `Locale` avant de toucher un cookie, une route, un redirect ou un rendu de portail.
- Aucun message serveur brut, secret de paiement, identifiant de commande ou erreur technique n’est exposé par la couche de traduction.

## Plan d’implémentation

1. Stabiliser le noyau i18n existant et ajouter les tests de parité des dictionnaires et de sérialisation.
2. Terminer l’admin déjà amorcé : shell, dashboard puis domaines fonctionnels complets, sans modifier leurs services métier.
3. Extraire les composants et messages d’authentification partagés ; créer les routes anglaises qui les composent.
4. Créer le dictionnaire portal, l’utilitaire de propagation `lang` et migrer les quatre pages hébergées ainsi que leurs composants client.
5. Faire évoluer le compilateur de modèles captifs afin que les liens et le sélecteur de langue soient présents dans chaque portail livré.
6. Migrer les réponses d’erreur des API portal vers les codes stables tout en conservant les messages de repli compatibles.
7. Vérifier la totalité des parcours en français et en anglais, puis publier une seule version sur le VPS.

## Critères d’acceptation

- L’anglais est sélectionnable et lisible sur chaque écran du SaaS, sans chaînes système françaises restantes.
- Une session créée depuis `/en/auth/...` ouvre l’administration en anglais.
- Le changement de langue admin survit au rechargement et ne change aucune donnée métier.
- Un client Wi-Fi peut choisir English avant l’achat ; English reste actif après OTP, redirection de paiement, succès, erreur, récupération du code et retour au portail.
- Tous les liens de portail préservent le thème, le slug, l’identifiant de commande lorsque nécessaire et la langue validée.
- Les API portal restent rétrocompatibles pendant la migration.
- La compilation TypeScript, les tests unitaires, les tests de parité et les contrôles de parcours passent avant déploiement.

## Risques traités

| Risque | Décision |
| --- | --- |
| Deux interfaces divergent | Une logique partagée, dictionnaires typés par domaine |
| Cookies indisponibles dans une fenêtre captive | `lang` explicite sur chaque URL portal |
| Textes interpolés non sérialisables côté client | Interpolation côté serveur, props primitives seulement |
| Traduction d’un contenu commercial opérateur sans accord | Les contenus saisis restent inchangés |
| Une erreur d’API dépend d’une phrase française | Codes stables, rendu localisé, repli compatible |
| Régression de l’auto-connexion | Aucun changement des paramètres RouterOS ou du code Wi-Fi |
