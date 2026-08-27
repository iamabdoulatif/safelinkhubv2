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
