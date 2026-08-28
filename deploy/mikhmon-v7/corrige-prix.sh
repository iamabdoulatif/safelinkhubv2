#!/bin/sh
# Retire la division par 100 des trois modèles de tickets. Voir le Dockerfile
# pour le pourquoi.
#
# Le script VÉRIFIE son propre effet. Un `sed` qui ne trouve pas son motif sort
# en 0 : sans contrôle, une image inchangée passerait la construction et rien
# ne la distinguerait de l'originale — on ne s'en apercevrait qu'en imprimant
# un ticket. Si l'amont renomme ces lignes, la construction doit échouer, pas
# livrer en silence.
set -e

cd /src/src/voucher

MODELES="template.php template-small.php safetmp.php"

for f in $MODELES; do
  [ -f "$f" ] || { echo "ÉCHEC : modèle absent — $f"; exit 1; }

  # Les deux lignes sont remplacées ENTIÈREMENT plutôt que rapiécées : leur
  # indentation diffère d'un modèle à l'autre, et un motif qui devrait la
  # décrire serait plus fragile que la ligne elle-même.
  sed -i \
    -e 's|^\([[:space:]]*\)\$priceClean = .*|\1$priceClean = preg_replace("/[^0-9]/", "", preg_replace("/[.,][0-9]{1,2}$/", "", trim($price)));|' \
    -e 's|^\([[:space:]]*\)\$priceValue = intval.*|\1$priceValue = $priceRaw;|' \
    "$f"
done

echo "--- vérification ---"
for f in $MODELES; do
  if grep -n "/ 100" "$f"; then
    echo "ÉCHEC : $f divise toujours par 100 — le motif amont a changé"
    exit 1
  fi
  grep -q '\$priceValue = \$priceRaw;' "$f" || {
    echo "ÉCHEC : $f n'a pas été corrigé"
    exit 1
  }
  # La syntaxe est vérifiée ici, pas au premier ticket imprimé.
  php -l "$f"
done
echo "--- les trois modèles impriment le prix tel quel ---"
