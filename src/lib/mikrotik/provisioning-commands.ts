/**
 * Fragments de commandes RouterOS partagés par les scripts d'ajout / de
 * remplacement de routeur (la commande copier-coller de `addRouter` et de
 * `buildReplacementInstallCommand`). Isolés ici pour rester identiques et
 * testables des deux côtés.
 */

/**
 * Active TOUTES les radios WiFi de la carte, de façon COMPATIBLE RouterOS 7.9
 * → 7.23.x.
 *
 * Le chemin du menu WiFi change selon la version et le pilote :
 *   - `/interface/wifi`       — RouterOS 7.13+ (paquet « wifi » des cartes ax) ;
 *   - `/interface/wifiwave2`  — RouterOS 7.9 → 7.12 sur les cartes ax (l'ancien
 *                               nom du même paquet, avant son renommage) ;
 *   - `/interface/wireless`   — pilote hérité des cartes non-ax (hAP ac², etc.),
 *                               toutes versions.
 *
 * Piège : un chemin de menu INEXISTANT échoue au moment du **parse** de la
 * ligne — pas à l'exécution. Or la commande d'ajout est une seule ligne dont
 * les commandes sont séparées par `;` : si l'un des menus WiFi n'existe pas sur
 * la carte/version, TOUTE la ligne échoue au parse (emportant l'installation
 * critique du VPN avec elle), et `:do … on-error` ne peut PAS rattraper une
 * erreur de parse. La parade — déjà employée dans install-vpn.rsc pour
 * veth/container — est de construire chaque variante en CHAÎNE puis de la
 * `[:parse]` au RUNTIME dans un `:do {} on-error={}` : un échec de `:parse` à
 * l'exécution EST rattrapable. Résultat : seule la variante qui existe sur
 * cette carte s'exécute, les deux autres sont ignorées silencieusement.
 *
 * (`$c` n'est PAS une interpolation de gabarit JS — le `$` n'est spécial que
 * suivi de `{` — c'est bien la variable RouterOS qui exécute le script parsé.)
 */
export const WIFI_ENABLE_ANY_VERSION =
  ':do {:local c [:parse "/interface/wifi/set [find] disabled=no"]; $c} on-error={}; ' +
  ':do {:local c [:parse "/interface/wifiwave2/set [find] disabled=no"]; $c} on-error={}; ' +
  ':do {:local c [:parse "/interface/wireless/set [find] disabled=no"]; $c} on-error={}';
