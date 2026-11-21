<?php
/**
 * Une couleur par prix, pour les tickets imprimés.
 *
 * POURQUOI UN SEUL FICHIER. La couleur vivait en double dans chacun des trois
 * modèles : un `switch ($priceValue)` d'un côté, une liste de classes CSS de
 * l'autre. Les deux ont dérivé — la liste déclarait `.bg-800` quand le switch
 * testait `case 700`, si bien qu'un ticket à 800 F sortait en gris sans que
 * rien ne le signale. Une seule table, lue par le switch ET par le CSS, ne
 * peut plus se désynchroniser.
 *
 * LES PRIX VIENNENT DU PARC, pas d'une idée de ce qu'ils devraient être :
 * relevés sur les forfaits actifs en production. Les valeurs 10, 20 et 30 sont
 * écartées — ce sont des essais, pas des tarifs.
 *
 * LES COULEURS sont la palette de Sasha Trubetskoy, choisie pour rester
 * distinguable à ce nombre de teintes ; assemblée à la main, la douzième
 * ressemble toujours à la troisième. Chacune porte la couleur de texte qui
 * tient dessus : sur le jaune ou le lavande, du blanc serait illisible — et un
 * ticket se lit sur papier, souvent mal imprimé, en plein soleil.
 */

function slh_palette_prix()
{
    return array(
        100   => array('#E6194B', 'clair'), // rouge
        200   => array('#F58231', 'clair'), // orange
        300   => array('#FFE119', 'fonce'), // jaune
        500   => array('#3CB44B', 'clair'), // vert
        700   => array('#42D4F4', 'fonce'), // cyan
        750   => array('#BFEF45', 'fonce'), // lime
        800   => array('#4363D8', 'clair'), // bleu
        1000  => array('#911EB4', 'clair'), // violet
        1200  => array('#F032E6', 'clair'), // magenta
        1500  => array('#469990', 'clair'), // sarcelle
        2000  => array('#9A6324', 'clair'), // brun
        2500  => array('#800000', 'clair'), // bordeaux
        3000  => array('#000075', 'clair'), // marine
        3500  => array('#808000', 'clair'), // olive
        4000  => array('#FFD8B1', 'fonce'), // abricot
        5000  => array('#FABED4', 'fonce'), // rose
        12000 => array('#DCBEFF', 'fonce'), // lavande
    );
}

/** La classe CSS d'un prix. Un prix inconnu garde le gris par défaut. */
function slh_classe_prix($priceValue)
{
    $palette = slh_palette_prix();
    return isset($palette[$priceValue]) ? 'bg-' . $priceValue : 'bg-default';
}

/** Les règles CSS, engendrées depuis la même table que le switch. */
function slh_css_prix()
{
    $css = "\n    /* Couleurs unies et vives — une par prix du parc, engendrées\n"
         . "       depuis couleurs-prix.php. Ne pas les recopier ici à la main :\n"
         . "       c'est cette recopie qui avait fait diverger 700 et 800. */\n";
    foreach (slh_palette_prix() as $prix => $def) {
        list($fond, $texte) = $def;
        $couleurTexte = $texte === 'fonce' ? '#1e293b' : '#FFFFFF';
        $ombre = $texte === 'fonce' ? 'none' : '0 1px 2px rgba(0,0,0,0.25)';
        $css .= sprintf(
            "    .bg-%d { background: %s; color: %s; }\n"
          . "    .bg-%d .hotspot-name { color: %s; text-shadow: %s; }\n",
            $prix, $fond, $couleurTexte, $prix, $couleurTexte, $ombre
        );
    }
    $css .= "    .bg-default { background: #AAAAAA; color: #FFFFFF; }\n";
    return $css;
}
