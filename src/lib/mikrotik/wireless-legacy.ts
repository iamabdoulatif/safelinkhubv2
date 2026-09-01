/**
 * Wi-Fi des cartes SANS le paquet « wifi » — RB951, hEX, wAP, hAP ac…
 *
 * POURQUOI CE FICHIER EXISTE. L'auto-setup ne posait le SSID qu'en parcourant
 * `/interface/wifi/print`. Sur une carte MIPS, ce menu n'existe pas : la
 * requête renvoie une liste vide, la boucle ne tourne pas une seule fois, et
 * le SSID reste « MikroTik » — sans la moindre erreur, puisque rien n'a
 * échoué. C'est exactement ce qui a été constaté sur un RB951Ui-2HnD en
 * RouterOS 7.24.1 : le nom saisi dans SafeLinkHub n'atteignait jamais la radio.
 *
 * Le pilote hérité vit sous `/interface/wireless`, et il ne partage RIEN avec
 * le paquet wifi : ni les noms de propriétés (`ssid` seul, pas
 * `configuration.ssid`), ni les valeurs (`mode=ap-bridge` et non `ap`), ni les
 * bandes (`2ghz-b/g/n` et non `2ghz-ax`). Une commande de l'un envoyée à
 * l'autre est rejetée EN BLOC — et comme `/interface/wireless/set` est atomique,
 * un seul paramètre inconnu annule le SSID avec le reste.
 *
 * Les valeurs reprennent une configuration relevée sur un RB951 en service,
 * fournie par l'exploitant, plutôt qu'une composition d'après la documentation.
 */

export type WirelessLegacyRadio = {
  /** Nom courant de l'interface (`wlan1`…). */
  name: string;
  /** Bandes annoncées par la radio, si RouterOS les rapporte. */
  band?: string;
};

/**
 * Le pays, sur le pilote hérité, n'est PAS celui du paquet wifi.
 *
 * `/interface/wifi` accepte « United States » ; `/interface/wireless` attend
 * des identifiants en minuscules (`united states3`, `no_country_set`…) et
 * refuse la commande entière sur une valeur inconnue. On garde donc
 * `no_country_set`, valeur de la configuration de référence, qui laisse la
 * radio 2,4 GHz libre de ses canaux.
 *
 * Ce choix est SANS DANGER ici parce que ces cartes sont mono-bande 2,4 GHz :
 * il n'y a pas de canal DFS à débloquer. Sur une carte 5 GHz, un pays manquant
 * fige la radio en « DFS channel availability check » — voir l'audit wifi-dfs.
 */
export const LEGACY_COUNTRY_DEFAUT = "no_country_set";

/** La radio est-elle en 5 GHz ? Sur ces cartes, c'est l'exception. */
export function estRadio5Ghz(radio: WirelessLegacyRadio): boolean {
  return (radio.band ?? "").includes("5ghz");
}

/**
 * La commande qui pose le SSID sur une radio héritée.
 *
 * `disabled=no` est dans la MÊME commande que le SSID, volontairement : en
 * deux temps, une radio pouvait s'allumer en gardant l'ancien nom si la
 * seconde commande échouait.
 */
export function commandeSsidLegacy(
  radio: WirelessLegacyRadio,
  ssid: string,
  country: string = LEGACY_COUNTRY_DEFAUT,
): string[] {
  const cinqGhz = estRadio5Ghz(radio);
  return [
    "/interface/wireless/set",
    `=numbers=${radio.name}`,
    `=ssid=${ssid}`,
    // `ap-bridge` et non `ap` : sur le pilote hérité, `ap` n'existe pas et la
    // commande entière est rejetée.
    "=mode=ap-bridge",
    `=band=${cinqGhz ? "5ghz-a/n/ac" : "2ghz-b/g/n"}`,
    `=channel-width=${cinqGhz ? "20/40/80mhz-XXXX" : "20/40mhz-XX"}`,
    "=frequency=auto",
    // Laisse RouterOS choisir la puissance selon le pays plutôt qu'une valeur
    // fixe qui serait illégale ailleurs.
    "=frequency-mode=manual-txpower",
    `=country=${country}`,
    // WPS ouvre une porte d'association sans mot de passe : hors sujet sur un
    // hotspot, dont l'authentification se fait au portail.
    "=wps-mode=disabled",
    "=disabled=no",
  ];
}

/**
 * Faut-il passer par le pilote hérité ?
 *
 * On se fie à ce que la carte RÉPOND, pas à son architecture : une carte ARM
 * ancienne peut n'avoir que `/interface/wireless`, et c'est le menu réellement
 * présent qui tranche. Le paquet wifi prime quand il existe — c'est la
 * consigne pour les cartes ARM et ARM64.
 */
export function utiliserPiloteHerite(
  interfacesWifi: readonly unknown[],
  interfacesWireless: readonly unknown[],
): boolean {
  return interfacesWifi.length === 0 && interfacesWireless.length > 0;
}

/**
 * Le conteneur MikHmon a-t-il un sens sur cette carte ?
 *
 * RouterOS n'expose le menu `/container` que sur arm, arm64 et tile. Sur une
 * carte MIPS ou PowerPC, son absence n'est pas une panne : c'est le
 * fonctionnement normal, et MikHmon vit alors sur le relais.
 *
 * La vérification d'après auto-setup l'annonçait pourtant en rouge, avec un
 * bouton « Continuer l'auto-setup » qui ne pouvait rien réparer — l'exploitant
 * relançait une configuration déjà complète en croyant à un échec.
 */
const ARCHITECTURES_CONTENEUR = new Set(["arm", "arm64", "tile"]);

export function architectureAccepteConteneur(architectureName: string | null | undefined): boolean {
  return ARCHITECTURES_CONTENEUR.has((architectureName ?? "").trim().toLowerCase());
}
