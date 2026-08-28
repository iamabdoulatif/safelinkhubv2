# MikHmon v7 — l'édition SafeLinkHub, avec le prix des tickets corrigé.
#
# COUCHE MINCE SUR L'IMAGE DE L'EXPLOITANT. `latif225/mikhmon-sf-v1` est le
# compte de l'exploitant, mais la recette de cette image ne vit pas dans ce
# dépôt : on ne peut ni la corriger à la source, ni republier chez lui depuis
# cette CI. On repart donc de son image et on corrige les trois modèles.
#
# CE QUI ÉTAIT FAUX. Les modèles lisaient le prix formaté par MikHmon, en
# retiraient tout ce qui n'est pas un chiffre, puis DIVISAIENT PAR 100 :
#
#     $priceClean = preg_replace('/[^0-9]/', '', $price);   // "fcfa 1 500" → "1500"
#     $priceValue = intval($priceRaw / 100);                //              → 15
#
# Pour une devise à montants entiers — le FCFA — MikHmon formate déjà en francs
# entiers (`number_format($amount, 0, ',', ' ')`, mikhmon_compat.php). Un ticket
# à 1 500 F s'imprimait donc à 15 F, et la couleur de l'en-tête, choisie sur ce
# même `switch ($priceValue)`, tombait toujours sur le gris par défaut.
#
# La division n'avait de sens que pour une devise à deux décimales, où
# « USD 5.00 » donne les chiffres « 500 ». C'est ce cas-là qu'on traite
# maintenant en retirant la partie décimale AVANT d'extraire les chiffres,
# plutôt qu'en divisant : les deux familles de devises tombent juste, et le
# nombre imprimé est celui que MikHmon a calculé.
FROM latif225/mikhmon-sf-v1:latest

COPY corrige-prix.sh /tmp/corrige-prix.sh
RUN sh /tmp/corrige-prix.sh && rm /tmp/corrige-prix.sh
