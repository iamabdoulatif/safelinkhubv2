# MikHmon v7 — habillage SafeLinkHub (couleurs d'origine conservées).
#
# COUCHE MINCE SUR mikhmon-v7:prix-corrige (l'image du parc, tickets corrigés).
# On ne refait pas le correctif prix : on part de l'image déjà corrigée et on
# ajoute UNIQUEMENT l'habillage de l'interface admin. Publiée sous le tag PROD
# IMMUABLE :ui-1 (déploiement sur tout le parc par re-création de conteneur,
# mécanisme 2 — le dépôt de fichiers à chaud s'est révélé non fiable : l'overlay
# du conteneur continuait de servir le headhtml cuit dans l'image).
#
# Ce que fait l'habillage :
#   - garde la palette NATIVE MikHmon (ardoise + bleu #20a8d8), pas de rebrand
#     couleur ; seulement la mise en page / l'aération / la cohérence ;
#   - supprime la couleur ALÉATOIRE par carte de session (la « carte violette »)
#     dans sessions.php ;
#   - la skin est désormais INLINE dans headhtml.php (un <style>) : plus de <link>
#     vers css/safelink-skin.css. Le COPY du CSS reste (inoffensif, non référencé).
FROM ghcr.io/iamabdoulatif/mikhmon-v7:prix-corrige

COPY safelink-skin.css /src/src/css/safelink-skin.css
COPY headhtml.php       /src/src/include/headhtml.php
COPY sessions.php       /src/src/settings/sessions.php

RUN php -l /src/src/include/headhtml.php \
 && php -l /src/src/settings/sessions.php
