# Tableau de bord SafeLinkHub — cockpit équilibré

**Date :** 14 août 2026  
**Statut :** direction validée pour revue  
**Périmètre :** `src/app/admin/page.tsx` et les composants strictement nécessaires à son affichage.

## Intention

Le tableau de bord doit permettre à un opérateur de répondre, dès son arrivée, à deux questions de même importance :

1. Le parc et les accès sont-ils opérationnels ?
2. L’activité commerciale est-elle saine sur la période choisie ?

La référence de mise en page fournie sert à structurer l’écran (navigation latérale, bandeau supérieur, cartes de synthèse, zone opérationnelle, tendances), sans importer son univers logistique. Le langage existant SafeLinkHub est conservé : fond papier, encre sombre, contours nets, jaune moutarde pour l’action et les décisions, vert pour les états sains, orange réservé à une attention requise.

## Hiérarchie de l’écran

### 1. En-tête et période

- Titre « Tableau de bord », nom de l’organisation et période active.
- Le sélecteur de dates actuel reste la source unique de la période. Il pilote les ventes, dépenses et tendance financière.
- Une action primaire compacte dirige vers le flux le plus utile selon l’état : « Lier un MikroTik » lorsqu’il n’existe aucun routeur, sinon « Voir le parc ».
- Aucun faux indicateur de temps réel : les données réseau affichent explicitement leur dernier état connu lorsque cette information est disponible.

### 2. Bande Action requise

- Elle apparaît uniquement lorsqu’un incident ou une situation à risque mérite une action : routeur hors ligne, aucun routeur lié, ou crédit sous un seuil défini.
- Elle expose un seul problème prioritaire, sa conséquence et une action contextuelle. Les autres alertes sont accessibles depuis la vue réseau.
- La couleur orange, l’icône et le texte sont toujours combinés ; la couleur seule ne véhicule jamais l’état.
- En l’absence de problème, l’espace est supprimé plutôt que remplacé par un message rassurant sans valeur opérationnelle.

### 3. Synthèse à quatre cartes

La première ligne donne un équilibre strict entre activité et exploitation :

| Carte | Donnée | Destination |
| --- | --- | --- |
| Ventes nettes | revenu net de la période et variation si comparable | Ventes |
| Routeurs | `en ligne / total` | Parc routeurs |
| Utilisateurs actifs | somme des sessions actives connues | Supervision |
| Crédit du compte | solde prépayé net | Facturation |

- Les cartes sont toutes de même poids visuel. Le jaune moutarde peut souligner « Ventes nettes » mais ne masque pas le statut du réseau.
- Les valeurs restent tabulaires pour empêcher les sauts visuels lors des rafraîchissements.
- Les données déjà produites par `getDashboardData` sont réemployées ; aucune requête financière ne doit être dupliquée.

### 4. Zone centrale : performance et parc à suivre

Sous les KPI, une grille asymétrique reproduit la lisibilité du wireframe.

- **Colonne principale — Performance commerciale :** graphique existant de revenu brut et dépenses, plage affichée et légende accessible. Le graphique conserve ses séries actuelles afin de ne pas présenter un revenu net calculé comme une donnée brute.
- **Colonne secondaire — Parc à suivre :** une liste courte, triée par gravité puis nom, présentant les routeurs non sains en premier. Chaque ligne montre statut, nom du routeur, contexte utile et lien vers sa fiche ou la liste du parc.
- S’il n’y a aucune anomalie, cette colonne devient un état positif compact (« Parc sain ») avec le nombre de routeurs en ligne, sans inventer de données de télémétrie.
- Les paiements récents passent sous cette grille sur petit écran ou dans une rangée secondaire sur grand écran. Ils gardent leur destination vers les ventes et les informations existantes (forfait, utilisateur, date, montant).

### 5. États vides, erreurs et mobile

- Sans ventes ni dépenses sur la période : le graphique explique clairement ce qui alimentera la zone, sans masquer les KPI réseau.
- Sans routeur : la carte Routeurs et le panneau Parc orientent vers l’auto-setup ; aucun lien ne prétend ouvrir un parc inexistant.
- Sans session utilisateur : le compteur affiche `0` de manière explicite.
- Sur mobile : une colonne unique dans cet ordre : en-tête, action requise, KPI, performance, parc, paiements récents. Les cartes deviennent une grille de deux, sans barre d’actions flottante.
- Les raccourcis restent utilisables au clavier, les liens conservent des intitulés intelligibles et les graphiques gardent un libellé accessible.

## Architecture proposée

La page serveur reste le point d’assemblage des données et de l’autorisation. Les nouvelles unités, si nécessaires, ont chacune une responsabilité précise :

| Unité | Responsabilité | Dépendances |
| --- | --- | --- |
| `DashboardAlert` | choisit et rend l’unique action requise | agrégat réseau/crédit validé |
| `DashboardKpis` | affiche les quatre métriques homogènes | `DashboardData` |
| `FleetWatchlist` | rend les routeurs à suivre et l’état sain | liste de routeurs normalisée |
| `RecentPayments` | extrait la liste existante de paiements récents | `DashboardData.recentSales` |

`getDashboardData` demeure responsable des ventes, dépenses, crédit et compteurs de routeurs. Une extension destinée à la liste « Parc à suivre » ne doit sélectionner que les champs nécessaires (identifiant, nom, statut, utilisateurs actifs et éventuel état de fraîcheur), filtrés par `orgId`. Elle ne doit exposer ni secret, ni identifiant VPN, ni adresse publique.

## Comportement et sécurité

- Toutes les lectures restent limitées à l’organisation de la session.
- Les routes de destination restent les pages déjà protégées par l’administration.
- Aucun bouton du dashboard ne déclenche un changement réseau, une facturation ou une synchronisation sans flux de confirmation existant.
- L’alerte de crédit ne sera ajoutée que si le produit dispose déjà d’un seuil métier défini. En l’absence de seuil, aucune alerte approximative ne sera créée.

## Vérification attendue

1. Tests unitaires de l’ordre de priorité des alertes et de la sélection de routeurs à suivre.
2. Tests de rendu pour les trois états : parc sain, routeur hors ligne, aucun routeur.
3. Test de non-régression des paramètres de période : les KPI financiers et le graphique suivent la même plage.
4. Test d’autorisation/isolement : une organisation ne peut lire aucun routeur ou paiement d’une autre.
5. Vérification responsive à 375 px, 768 px et 1440 px ; navigation clavier et libellés accessibles.

## Hors périmètre

- Carte géographique, suivi GPS et données de livraison du wireframe de référence.
- Nouvelle télémétrie des MikroTik ou polling temps réel.
- Refonte de la navigation globale et des pages Routeurs, Ventes, Facturation ou Supervision.
