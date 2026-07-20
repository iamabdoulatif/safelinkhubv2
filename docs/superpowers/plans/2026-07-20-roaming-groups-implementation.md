# Plan d'implémentation — groupes roaming

> Exécuter les étapes dans l'ordre ; chaque test doit d'abord échouer pour le
> comportement qu'il protège.

**Objectif :** gérer des profils communs, des prix par groupe et la génération
de tickets utilisables sur les routeurs d'un même groupe.

## 1. Ajouter le modèle persistant

**Fichiers :**
- Modifier : `src/lib/db/schema.ts`
- Créer : `scripts/add-roaming-groups.sql`

Créer les quatre tables roaming et les références optionnelles sur `vouchers`.
Ajouter index et contraintes d'unicité par organisation. La migration doit être
additive et réexécutable.

## 2. Protéger le calcul des tarifs

**Fichiers :**
- Créer : `src/lib/roaming/pricing.test.ts`
- Créer : `src/lib/roaming/pricing.ts`

Écrire les tests pour le tarif catalogue, une surcharge à zéro et une surcharge
positive ; implémenter `effectiveRoamingPrice` uniquement après l'échec.

## 3. Ajouter les actions serveur et le provisionnement

**Fichiers :**
- Créer : `src/lib/roaming/actions.ts`
- Modifier : `src/lib/vouchers/reconcile.ts`

Créer et modifier les groupes, profils et offres avec contrôle d'organisation.
Générer le même compte Hotspot sur les routeurs membres, créer le voucher et
ses liaisons, puis persister le prix effectif. Le lot ne s'émet que lorsque
tous les routeurs répondent ; les comptes créés sont compensés en cas d'échec.
Adapter la réconciliation pour obtenir la durée depuis un profil roaming
lorsqu'il n'y a pas de package.

## 4. Construire la station roaming

**Fichiers :**
- Créer : `src/app/admin/roaming/page.tsx`
- Créer : `src/app/admin/roaming/RoamingConsole.tsx`
- Créer : `src/app/admin/roaming/RoamingModals.tsx`
- Modifier : composant de navigation administrateur identifié par recherche

Afficher les groupes, la couverture routeur, les tarifs hérités/surchargés et
la création de tickets. Réutiliser les couleurs et composants de la station de
contrôle existante.

## 5. Vérifier et livrer

**Commandes :**
- `npm test -- --runInBand` ou les scripts de test ciblés disponibles
- `npm run lint`
- `npm run build`

Appliquer la migration sur la base de production, faire le commit, pousser
`main`, synchroniser la source vers le serveur puis exécuter le script de
déploiement canonique. Vérifier le conteneur et la page publique après le
redémarrage.
