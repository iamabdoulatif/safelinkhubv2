# MikHmon v6 — la version française

« v6 » désigne la version de **RouterOS**, pas celle de MikHmon : c'est
l'édition destinée aux cartes MIPS restées en RouterOS 6 (RB951, hEX, wAP…),
qui ne savent héberger ni conteneur, ni l'édition SafeLinkHub. Celle-ci porte le
surnom « v7 ». Les deux noms vivent dans
`src/lib/mikrotik/mikhmon-editions.ts`.

Le logiciel est **MikHmon v3 de laksa19** (<https://laksa19.github.io/?mikhmon/v3/download>),
que nous ne recopions pas ici : seul le fichier de langue nous appartient.

## Ce que contient ce dossier

    lang/fr.php    la traduction française complète (155 clés)

## L'installer

MikHmon construit son menu de langues avec un `glob('lang/*')`
(`include/menu.php`), et `"fr"` figure déjà dans `lang/isocodelang.php`. Il
suffit donc de déposer le fichier — aucun code à modifier :

```bash
cp deploy/mikhmon-v6/lang/fr.php <racine-mikhmon>/lang/fr.php
```

La langue apparaît alors sous « Français » dans le sélecteur en haut à droite.

## La maintenir

Quand laksa19 publie une version qui ajoute des libellés, comparez les clés
plutôt que les lignes — une clé absente ne provoque aucune erreur PHP : le
libellé disparaît simplement de l'écran.

```bash
diff <(grep -o '^\$_[a-zA-Z_]*' lang/en.php | sort) \
     <(grep -o '^\$_[a-zA-Z_]*' deploy/mikhmon-v6/lang/fr.php | sort)
```

`src/lib/mikrotik/mikhmon-editions.test.ts` vérifie déjà qu'aucune clé n'est
vide et que le compte reste plausible ; il échoue si quelqu'un vide une entrée.

## Choix de traduction

Les décisions qui ne vont pas de soi sont expliquées en tête de `lang/fr.php`.
Les deux qui reviennent le plus souvent :

- **voucher → ticket**, le mot qu'emploient les exploitants et le reste de
  SafeLinkHub ;
- **uptime**, traduit différemment selon le sujet — « temps de fonctionnement »
  pour le routeur, « temps utilisé » pour un client. Le même mot anglais couvre
  deux notions opposées.

## Où vit l'image, et pourquoi pas en local

L'image est publiée sur **`ghcr.io/iamabdoulatif/mikhmon-v6`** par le job
`mikhmon-v6` de `.github/workflows/deploy.yml`, qui ne se déclenche que si ce
dossier change.

Deux raisons de ne pas la garder sur le relais :

1. **Elle serait effacée.** `/root/deploy-slh-ghcr.sh` fait un
   `docker image prune -af` à chaque bascule, qui supprime toute image qu'aucun
   conteneur en marche n'utilise. Une image construite à la main sur le relais
   disparaît donc au premier déploiement suivant — c'est arrivé.

2. **Un nom nu pointe chez un inconnu.** Nommée `safelinkhub/mikhmon-v6`, une
   image absente en local serait cherchée sur Docker Hub, où ce compte ne nous
   appartient pas. Le jour où quelqu'un l'y publie, le relais lancerait son
   image avec les identifiants des routeurs.

L'édition v7 reste sur Docker Hub (`latif225/mikhmon-sf-v1`) : ce compte est
celui de l'exploitant, donc l'image est déjà sous son contrôle.
