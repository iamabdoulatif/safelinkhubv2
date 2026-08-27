# MikHmon v6 — MikHmon v3 de laksa19, en français.
#
# « v6 » désigne la version de RouterOS visée (cartes MIPS restées en 6.x), pas
# une version de MikHmon. Voir src/lib/mikrotik/mikhmon-editions.ts.
#
# La source est TÉLÉCHARGÉE, pas recopiée dans notre dépôt : elle ne nous
# appartient pas. Le commit est ÉPINGLÉ — `master` ferait de chaque
# reconstruction une version différente, et un parc où deux routeurs n'ont pas
# le même MikHmon est un parc qu'on ne sait plus dépanner.
FROM php:8-cli-alpine

# 2023-05-01, dernier commit de la branche master à ce jour.
ARG MIKHMON_REF=0743da95b6ab686c6510855c2ba629436a88c10d

RUN apk add --no-cache curl \
 && curl -fsSL "https://codeload.github.com/laksa19/mikhmonv3/tar.gz/${MIKHMON_REF}" -o /tmp/m.tgz \
 && mkdir -p /src \
 && tar xzf /tmp/m.tgz -C /src --strip-components=1 \
 && rm /tmp/m.tgz \
 && apk del curl

# Notre seul apport : la traduction. MikHmon construit son menu de langues avec
# un glob('lang/*'), le fichier suffit — aucun code amont n'est modifié.
COPY lang/fr.php /src/lang/fr.php

# Cette édition est LA française : la langue est posée à la construction, pas
# laissée à un clic. MikHmon lit include/lang.php avant tout le reste.
RUN echo '<?php $langid="fr";?>' > /src/include/lang.php \
# Deux fichiers que MikHmon RÉÉCRIT en marche : config.php porte les sessions,
# lang.php est réécrit à chaque changement de langue (settings/setlang.php fait
# un fopen(…, "w") et meurt sur « Cannot open file » s'il ne peut pas). Sans
# ces droits, MikHmon accepte les réglages à l'écran puis les perd au
# rechargement — sans le moindre message. Le conteneur tourne en root
# aujourd'hui, ce qui masque le problème ; on ne s'appuie pas là-dessus.
 && chmod 0666 /src/include/config.php /src/include/lang.php

WORKDIR /src
EXPOSE 80

# Même forme que l'édition v7 (serveur intégré de PHP sur le port 80) : le
# relais provisionne les deux instances avec le même code, sans cas particulier.
ENTRYPOINT ["php"]
CMD ["-S", "0.0.0.0:80", "-t", "/src"]
