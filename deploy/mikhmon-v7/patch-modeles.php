<?php
/**
 * Corrige les trois modèles de tickets de l'image amont, à la construction.
 *
 * Deux corrections :
 *   1. le prix était divisé par 100 (voir le Dockerfile) ;
 *   2. la couleur de l'en-tête vivait en double — un switch d'un côté, une
 *      liste CSS de l'autre — et les deux avaient divergé.
 *
 * ÉCRIT EN PHP, PAS EN SED : il s'agit de remplacer des BLOCS (un switch de
 * dix lignes, une liste de règles CSS). En sed, cela demanderait des plages
 * multi-lignes que personne ne saura relire dans six mois — et un motif qui
 * rate sort en 0, donc la construction livrerait l'image inchangée.
 *
 * Chaque remplacement est COMPTÉ et vérifié : si l'amont renomme une variable,
 * la construction échoue au lieu de publier une image sans correctif.
 */

$dossier = '/src/src/voucher';
$modeles = array('template.php', 'template-small.php', 'safetmp.php');
$erreurs = array();

foreach ($modeles as $nom) {
    $chemin = $dossier . '/' . $nom;
    if (!is_file($chemin)) {
        $erreurs[] = "$nom : modèle absent";
        continue;
    }
    $src = file_get_contents($chemin);
    $avant = $src;

    /* 1. Le prix, tel que MikHmon l'a calculé.
       La partie décimale est retirée AVANT l'extraction des chiffres : c'est
       le seul cas que la division par 100 traitait correctement (« USD 5.00 »
       donne les chiffres « 500 »). Les devises entières comme le FCFA, que
       MikHmon formate déjà en francs, tombent juste elles aussi. */
    $src = preg_replace(
        '/^([ \t]*)\$priceClean\s*=.*$/m',
        '$1$priceClean = preg_replace("/[^0-9]/", "", preg_replace("/[.,][0-9]{1,2}$/", "", trim($price)));',
        $src, -1, $nClean
    );
    $src = preg_replace(
        '/^([ \t]*)\$priceValue\s*=\s*intval\(\s*\$priceRaw\s*\/\s*100\s*\).*$/m',
        '$1$priceValue = $priceRaw;',
        $src, -1, $nValue
    );

    /* 2. La couleur : le switch entier est remplacé par un appel à la table
       partagée. On vise depuis l'affectation par défaut jusqu'à l'accolade
       fermante du switch, seule forme stable d'un modèle à l'autre — leur
       indentation et leurs commentaires diffèrent. */
    $src = preg_replace(
        '/\$colorClass\s*=\s*"bg-default"\s*;\s*\r?\n\s*switch\s*\(\s*\$priceValue\s*\)\s*\{.*?\n\s*\}/s',
        'require_once __DIR__ . "/couleurs-prix.php";' . "\n" . '$colorClass = slh_classe_prix($priceValue);',
        $src, -1, $nSwitch
    );

    /* 3. Les règles CSS des classes, engendrées depuis la même table.
       On s'ancre sur la SUITE DE RÈGLES elle-même — de la première `.bg-<prix>`
       jusqu'à `.bg-default` — et non sur un commentaire : les trois modèles
       n'ont ni le même commentaire, ni la même palette (safetmp allait jusqu'à
       poser des dégradés, que ces tickets ne veulent pas). */
    $src = preg_replace(
        '/[ \t]*\.bg-\d+\s*\{.*?\.bg-default\s*\{[^}]*\}/s',
        '<?php echo slh_css_prix(); ?>',
        $src, -1, $nCss
    );

    if ($nClean !== 1 || $nValue !== 1) {
        $erreurs[] = "$nom : prix non corrigé (clean=$nClean, value=$nValue)";
    }
    if ($nSwitch !== 1) {
        $erreurs[] = "$nom : switch de couleur non remplacé ($nSwitch)";
    }
    if ($nCss !== 1) {
        $erreurs[] = "$nom : bloc CSS des couleurs non remplacé ($nCss)";
    }
    if ($src === $avant) {
        $erreurs[] = "$nom : aucun changement";
    }

    file_put_contents($chemin, $src);
    echo "corrigé : $nom\n";
}

if ($erreurs) {
    echo "\nÉCHEC — le modèle amont a changé :\n  " . implode("\n  ", $erreurs) . "\n";
    exit(1);
}

/* Dernier filet : plus aucune trace des deux fautes, et la syntaxe tient. */
foreach ($modeles as $nom) {
    $src = file_get_contents($dossier . '/' . $nom);
    if (strpos($src, '/ 100') !== false) {
        echo "ÉCHEC : $nom divise encore par 100\n";
        exit(1);
    }
    if (strpos($src, 'switch ($priceValue)') !== false) {
        echo "ÉCHEC : $nom garde un switch de couleur en double\n";
        exit(1);
    }
}
echo "les trois modèles lisent la même table de couleurs\n";
