# MikHmon v7 — habillage SafeLinkHub (couleurs d'origine conservées).
#
# COUCHE MINCE SUR mikhmon-v7:prix-corrige (l'image du parc, tickets corrigés).
# On ne refait pas le correctif prix : on part de l'image déjà corrigée et on
# ajoute UNIQUEMENT l'habillage de l'interface admin. Publiée sous un tag DÉDIÉ
# (:ui-cobaye) pour tester sur 2-3 routeurs sans toucher :prix-corrige du parc.
#
# Ce que fait l'habillage (cf. safelink-skin.css) :
#   - garde la palette NATIVE MikHmon (ardoise + bleu #20a8d8), pas de rebrand
#     couleur ; seulement la mise en page / l'aération / la cohérence ;
#   - supprime la couleur ALÉATOIRE par carte de session (la « carte violette »)
#     dans sessions.php ;
#   - charge safelink-skin.css EN DERNIER via headhtml.php pour gagner sans
#     réécrire la structure.
FROM ghcr.io/iamabdoulatif/mikhmon-v7:prix-corrige

COPY safelink-skin.css       /src/src/css/safelink-skin.css
COPY mikhmon-responsive.css  /src/src/css/mikhmon-responsive.css
COPY headhtml.php            /src/src/include/headhtml.php
COPY sessions.php            /src/src/settings/sessions.php

RUN php -l /src/src/include/headhtml.php \
 && php -l /src/src/settings/sessions.php
