# MikHmon v7 — l'édition SafeLinkHub, tickets corrigés.
#
# COUCHE MINCE SUR L'IMAGE DE L'EXPLOITANT. `latif225/mikhmon-sf-v1` est le
# compte de l'exploitant, mais la recette de cette image ne vit pas dans ce
# dépôt : on ne peut ni la corriger à la source, ni republier chez lui depuis
# cette CI. On repart donc de son image et on corrige les trois modèles.
#
# CE QUI ÉTAIT FAUX — deux fautes, toutes deux silencieuses.
#
# 1. LE PRIX ÉTAIT DIVISÉ PAR 100.
#
#      $priceClean = preg_replace('/[^0-9]/', '', $price);   // "fcfa 1 500" → "1500"
#      $priceValue = intval($priceRaw / 100);                //              → 15
#
#    Pour une devise à montants entiers — le FCFA — MikHmon formate déjà en
#    francs entiers (`number_format($amount, 0, ',', ' ')`, mikhmon_compat.php).
#    Un ticket à 1 500 F s'imprimait donc à 15 F. La division n'avait de sens
#    que pour une devise à deux décimales, où « USD 5.00 » donne les chiffres
#    « 500 » : ce cas est désormais traité en retirant la partie décimale AVANT
#    d'extraire les chiffres, si bien que les deux familles tombent juste.
#
# 2. LA COULEUR VIVAIT EN DOUBLE, et les deux copies avaient divergé : la liste
#    CSS déclarait `.bg-800` quand le switch testait `case 700`. Un ticket à
#    800 F sortait en gris sans que rien ne le signale. Les deux lisent
#    maintenant couleurs-prix.php, seule table — et elle couvre les 17 prix
#    relevés sur les forfaits actifs du parc, au lieu de neuf.
FROM latif225/mikhmon-sf-v1:latest

COPY couleurs-prix.php /src/src/voucher/couleurs-prix.php
COPY patch-modeles.php /tmp/patch-modeles.php

RUN php /tmp/patch-modeles.php \
 && rm /tmp/patch-modeles.php \
 && for f in template.php template-small.php safetmp.php couleurs-prix.php; do \
      php -l "/src/src/voucher/$f"; \
    done
