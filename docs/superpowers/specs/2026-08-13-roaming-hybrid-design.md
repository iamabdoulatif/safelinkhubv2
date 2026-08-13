# Refonte hybride — station Roaming

## Décision

La station Roaming devient une interface hybride qui réunit trois modes
complémentaires, au lieu de présenter toutes les configurations et toutes les
actions dans la même grille :

1. **Exploitation** est la page par défaut. Elle se concentre sur un groupe
   sélectionné, sa couverture, ses alertes et l'émission d'accès.
2. **Assistant guidé** s'ouvre dans un tiroir pour les opérations à risque ou
   à plusieurs paramètres : créer des tickets, créer un compte nominatif et
   ajouter une zone.
3. **Groupes** est une vue de flotte dédiée qui compare l'état des groupes et
   permet d'ouvrir celui à administrer.

Cette organisation conserve les données et les Server Actions actuelles. Elle
ne modifie ni le provisionnement MikroTik, ni les règles de suppression, ni le
modèle de données.

## Objectifs utilisateur

- Voir immédiatement si TECH-ROAM est exploitable : zones en ligne, zones à
  vérifier et opérations incomplètes.
- Créer un lot de tickets depuis un point d'entrée unique, sans chercher parmi
  les paramètres de catalogue.
- Faire apparaître avant confirmation les conséquences d'une action sur les
  zones hors ligne.
- Pouvoir basculer entre des groupes sans perdre le contexte de travail.
- Garder les fonctions de catalogue et de comptes accessibles, mais hors de la
  trajectoire principale d'exploitation.

## Architecture de l'écran

### Navigation locale

Sous le titre de la station, une navigation à quatre onglets remplace le long
parcours numéroté actuel :

- **Exploitation** : vue par défaut.
- **Groupes** : tableau comparatif de la flotte.
- **Catalogue** : profils et offres par groupe.
- **Comptes** : création, recherche et gestion des comptes nominatifs.

Le sélecteur de groupe est partagé entre Exploitation, Catalogue et Comptes.
Il sélectionne TECH-ROAM au premier chargement lorsque ce groupe est actif,
sinon le premier groupe actif disponible.

### Onglet Exploitation

L'en-tête affiche le groupe sélectionné et un bouton primaire « Créer des
accès ». Trois indicateurs suivent : zones en ligne, zones à vérifier et
comptes nominatifs. La zone principale affiche les MikroTik en pastilles ou en
cartes compactes, avec leur statut et un accès « Gérer les zones ».

Une colonne d'activité présente les alertes opérables en priorité : zones hors
ligne, suppression à relancer et dernières créations. Les informations doivent
être issues des données déjà fournies à la page ; aucune nouvelle requête vers
un routeur ne doit être déclenchée par le rendu.

### Tiroirs guidés

Le bouton « Créer des accès » ouvre un tiroir latéral ou une modale sur mobile,
avec quatre étapes : groupe, offre, quantité/identifiants et vérification.
L'étape de vérification récapitule le nombre de zones joignables et non
joignables avant l'envoi de l'action existante.

Le même principe s'applique à « Ajouter une zone ». Le tiroir précise que les
comptes existants seront copiés avant l'écriture de l'appartenance du groupe.
Les suppressions restent à deux temps et conservent l'avertissement actuel :
un compte ne doit pas disparaître de la liste tant qu'une zone inaccessible
pourrait encore l'accepter.

### Onglet Groupes

Cette vue liste les groupes sous forme de tableau utilisable sur ordinateur et
de cartes sur mobile. Chaque ligne affiche le nom, le nombre de zones, le
nombre de zones en ligne, le nombre de comptes nominatifs et un état global :
opérationnel, attention ou pause. Ouvrir une ligne sélectionne le groupe et
retourne à Exploitation.

Créer, mettre en pause, reprendre ou supprimer un groupe reste disponible ici,
avec les mêmes confirmations et règles de sécurité qu'aujourd'hui.

### Onglet Catalogue et onglet Comptes

Catalogue rassemble les profils et offres pour le groupe sélectionné, avec les
contrôles pause/reprise/suppression existants. Comptes fournit une recherche,
la création d'un compte nominatif via tiroir et la liste des comptes existants.
Les actions Modifier, Mot de passe et Supprimer restent adjacentes au compte et
leurs messages de résultat restent visibles à cet endroit.

## Règles d'interface

- Une seule action primaire visible à la fois : « Créer des accès » dans
  Exploitation, « Créer un groupe » dans Groupes, etc.
- Les statuts n'utilisent jamais la couleur seule : point, libellé et compte
  sont affichés ensemble.
- Les formulaires ne sont pas présentés sur la page tant qu'une action ne les
  ouvre pas ; cela réduit la hauteur et la charge cognitive.
- Les écrans mobiles utilisent une barre d'onglets horizontalement défilable et
  des tiroirs plein écran.
- Les notifications sont proches de l'action concernée, avec `aria-live` pour
  les résultats asynchrones.

## Hors périmètre

- Aucune nouvelle action serveur, migration ou modification des règles RouterOS.
- Aucun changement au mécanisme d'expiration, d'auto-login MAC ou de
  synchronisation des zones.
- Aucun changement du menu d'administration global.

## Validation

- Les parcours créer des tickets, créer/modifier/supprimer un compte et ajouter
  une zone continuent d'appeler les mêmes Server Actions protégées.
- Les erreurs liées à une zone hors ligne restent explicites et localisées.
- Le rendu conserve les données sérialisables entre la page serveur et le
  composant client.
- Les tests existants Roaming passent, auxquels s'ajoutent des tests de
  sélection de groupe, de navigation locale et de visibilité des avertissements.
