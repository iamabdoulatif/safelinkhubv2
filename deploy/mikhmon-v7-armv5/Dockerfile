# MikHmon v7 pour les MikroTik ARM SANS unité flottante (hAP be lite, SoC
# Airoha/EcoNet AN7563, et toute carte du même genre).
#
# LE SYMPTÔME : le conteneur meurt au démarrage sur
#     « exited with signal 4 (Illegal instruction) »
# et pas seulement MikHmon : un simple `alpine:3.20` fait pareil.
#
# LA CAUSE : RouterOS « arm » tire la variante linux/arm/v7 des images. Toute
# l'arm/v7 du monde Docker (Alpine armv7, Debian armhf) est compilée en
# « hard-float » : elle suppose une unité VFP. Sur ces cartes, le noyau de
# RouterOS n'expose ni vfp ni neon (/proc/cpuinfo : « half thumb fastmult edsp
# tls idiva idivt lpae » et rien d'autre) : la première instruction flottante
# tue le processus. Seul le « soft-float » (armel, linux/arm/v5) y tourne —
# vérifié sur le routeur avec arm32v5/busybox, qui démarre et sort en 0.
#
# LA RÉPONSE : le même MikHmon (fichiers PHP, indépendants du processeur), posé
# sur le PHP armel de Debian. Debian armel pèse ~100 Mo installé, or ces cartes
# n'ont que 128 Mo de flash : on n'emporte QUE le binaire php, ses extensions et
# les bibliothèques qu'ils chargent vraiment, dans une image FROM scratch.

# 1. L'application, déjà corrigée (prix des tickets) : on la prend dans l'image
#    v7 publiée, en version amd64 — ce ne sont que des fichiers PHP.
FROM --platform=$BUILDPLATFORM ghcr.io/iamabdoulatif/mikhmon-v7:prix-corrige AS app
RUN php -m | tr 'A-Z' 'a-z' | grep -v '^\[' | grep -v '^$' | sort -u > /modules-attendus.txt

# 2. PHP armel, puis extraction du strict nécessaire dans /rootfs.
FROM debian:bookworm-slim AS php
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      php8.2-cli php8.2-mbstring php8.2-curl php8.2-xml php8.2-zip \
      php8.2-gd php8.2-sqlite3 php8.2-bcmath ca-certificates tzdata \
 && rm -rf /var/lib/apt/lists/*

COPY --from=app /src /rootfs/src
COPY --from=app /modules-attendus.txt /modules-attendus.txt

RUN set -eu; R=/rootfs; \
    mkdir -p $R/usr/bin $R/tmp $R/etc $R/var/lib/php/sessions; \
    chmod 1777 $R/tmp $R/var/lib/php/sessions; \
    cp -a /usr/bin/php8.2 $R/usr/bin/php; \
    cp -a --parents /etc/php /usr/lib/php /usr/share/zoneinfo /etc/ssl/certs /usr/share/ca-certificates $R/; \
    cp -a /etc/ld.so.cache /etc/localtime /etc/passwd /etc/group /etc/nsswitch.conf $R/etc/; \
    for f in /usr/bin/php8.2 $(find /usr/lib/php -name '*.so'); do ldd "$f"; done \
      | awk '/=>/ {print $3} /^[[:space:]]*\/.*ld-linux/ {print $1}' | sort -u \
      | while read -r lib; do [ -e "$lib" ] && cp -L --parents "$lib" $R/ || true; done; \
    cp -L --parents /lib/ld-linux.so.3 $R/; \
    # Vérifications, DANS le rootfs final (chroot) : si une bibliothèque manque,
    # la construction échoue ici au lieu de publier une image morte.
    chroot $R /usr/bin/php -v; \
    chroot $R /usr/bin/php -r 'echo "flottants: ", 1.5 * 2, "\n";'; \
    chroot $R /usr/bin/php -m | tr 'A-Z' 'a-z' | grep -v '^\[' | grep -v '^$' | sort -u > /modules-obtenus.txt; \
    manquants=$(comm -23 /modules-attendus.txt /modules-obtenus.txt | grep -v -e opcache -e '^zend' || true); \
    if [ -n "$manquants" ]; then echo "Extensions PHP manquantes par rapport à l'image v7 : $manquants"; exit 1; fi; \
    for f in $(find $R/src -name '*.php' | head -400); do chroot $R /usr/bin/php -l "${f#$R}" >/dev/null; done; \
    du -sh $R

# 3. L'image livrée : rien d'autre que ce rootfs.
FROM scratch
COPY --from=php /rootfs /
WORKDIR /src
EXPOSE 80
# Même forme que les autres éditions : le relais et le provisionnement n'ont
# pas de cas particulier à gérer.
ENTRYPOINT ["php"]
CMD ["-S", "0.0.0.0:80", "-t", "/src/src/"]
