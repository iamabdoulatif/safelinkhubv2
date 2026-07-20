# Groupes roaming — conception

**Date :** 20 juillet 2026
**Statut :** validé pour implémentation

## Objectif

Permettre à un opérateur de vendre un même ticket sur plusieurs MikroTik, sans
dupliquer sa grille commerciale. Les profils (par exemple `05-HEURES`,
`01-JOUR`, `01-MOIS`) sont communs à l'organisation ; chaque groupe roaming
peut utiliser le prix commun ou définir son propre prix.

## Portée V1

- Un groupe contient un ou plusieurs routeurs appartenant à l'organisation.
- Un profil roaming contient la durée, les débits et le tarif catalogue.
- Une offre d'un groupe référence un profil et peut surcharger son tarif.
- La création d'un ticket roaming provisionne le même identifiant et le même
  mot de passe sur chaque routeur membre du groupe.
- Le ticket conserve le groupe, le profil et le prix effectivement vendu pour
  rester lisible après une modification tarifaire.
- La page de gestion adopte la palette existante (noir encre, jaune marque,
  papier) et reste dense : groupes, couverture, offres et création de tickets
  sont accessibles sans changer de contexte.

## Limite explicite

Cette première livraison utilise le provisionnement multi-routeur déjà en
place. La date d'expiration est réconciliée entre les routeurs, mais elle ne
met pas en place un serveur RADIUS central ; elle ne promet donc pas encore un
compteur de minutes ou de volume agrégé en temps réel. Une étape RADIUS sur le
relais WireGuard sera nécessaire avant d'afficher cette promesse dans le
produit.

## Modèle de données

- `roaming_groups` : groupe, code public, état et organisation.
- `roaming_group_routers` : membres d'un groupe.
- `roaming_profiles` : catalogue de profils communs à une organisation.
- `roaming_group_offers` : activation d'un profil dans un groupe et éventuel
  `price_override_cents`.
- `vouchers` : références optionnelles au groupe et au profil roaming, ainsi
  qu'un instantané du tarif vendu.

Les suppressions de groupe et de profil sont empêchées par les références ; on
désactive les offres à la place. Toutes les actions vérifient l'organisation
et le rôle administrateur.

## Parcours opérateur

1. Créer un groupe et sélectionner les MikroTik couverts.
2. Créer les profils communs et leur tarif catalogue.
3. Activer les profils dans le groupe ; conserver le prix commun ou entrer une
   surcharge locale.
4. Générer les tickets depuis l'offre du groupe. Le même ticket apparaît dans
   les routeurs membres et dans la station de contrôle des tickets.
