/**
 * DISCRÉTION CÔTÉ FAI — ce que le routeur raconte de lui-même au réseau du
 * fournisseur (Starlink, fibre, 4G), et comment le taire.
 *
 * CE QUI EST POSSIBLE. Un MikroTik branché sur une box FAI s'annonce de quatre
 * façons, toutes réductibles :
 *   1. son ADRESSE MAC d'usine, dont l'OUI est déposé à l'IEEE au nom de
 *      « Routerboard.com » — c'est ce nom que l'application Starlink affiche
 *      dans sa liste d'appareils, quel que soit le nom d'hôte envoyé ;
 *   2. le NOM D'HÔTE de l'option DHCP 12, qui vaut par défaut l'identité
 *      système (« HSPT-FOUANGA ») et voyage en clair dans chaque bail ;
 *   3. la DÉCOUVERTE DE VOISINAGE (MNDP/CDP/LLDP), diffusée par défaut sur
 *      TOUTES les interfaces statiques — WAN comprise — avec le modèle, la
 *      version de RouterOS et l'identité ;
 *   4. le DDNS MikroTik (/ip cloud), qui publie l'IP publique du lien sous
 *      « xxx.sn.mynetname.net » chez MikroTik.
 *
 * CE QUI NE L'EST PAS : le VOLUME. Les téra-octets sont comptés par le FAI à
 * sa propre passerelle, sur des paquets qui traversent forcément son réseau.
 * Aucun réglage du routeur client ne peut les lui cacher — un VPN masque la
 * NATURE du trafic, jamais sa quantité. Ce module ne prétend donc rien sur ce
 * terrain, et l'écran le dit.
 *
 * Tout est PUR ici (aucun accès réseau) : l'inspection prend des lignes déjà
 * lues, le plan rend des commandes RouterOS à exécuter. Voir
 * wan-stealth-actions.ts pour la lecture et la pose.
 */
import { createHash } from "crypto";

/** Un lien WAN tel que lu sur le routeur. */
export type WanLink = {
  /** Nom de l'interface (« E1-WAN-FAI »). */
  name: string;
  /** `.id` de la ligne /interface/ethernet, pour la pose. */
  ethId: string;
  mac: string;
  /** MAC d'usine conservée par RouterOS — l'égalité avec `mac` = OUI constructeur exposé. */
  origMac: string;
  /** `.id` du client DHCP posé sur ce lien, si présent. */
  dhcpId?: string;
  /** Options DHCP envoyées (« hostname,clientid » par défaut). */
  dhcpOptions?: string;
  /** Nom réellement envoyé au FAI, si résolu. */
  sentHostname?: string | null;
};

export type StealthLeakId = "mac-vendor" | "hostname" | "discovery" | "cloud" | "services";

export type StealthLeak = {
  id: StealthLeakId;
  label: string;
  detail: string;
  /** Interfaces concernées, quand le constat est par lien. */
  interfaces?: string[];
  /** Faux = constat informatif, à traiter à la main (rien n'est posé pour lui). */
  fixable: boolean;
};

export type WanStealthInput = {
  links: WanLink[];
  /** `discover-interface-list` de /ip/neighbor/discovery-settings. */
  discoverList: string;
  /** Protocoles annoncés (« cdp,lldp,mndp »). */
  discoverProtocols: string;
  /** /ip/cloud ddns-enabled. */
  cloudDdns: boolean;
  /** Listes d'interfaces existantes, pour savoir si « LAN » est disponible. */
  interfaceLists: string[];
  /** Services à l'écoute SANS restriction d'adresse (`address=` vide). */
  openServices: string[];
};

/**
 * Listes d'interfaces qui englobent forcément le WAN. `static` est le défaut
 * RouterOS et c'est le piège : il contient toutes les interfaces posées à la
 * main, WAN comprise.
 */
const LISTS_INCLUANT_WAN = new Set(["all", "static", "dynamic", "WAN"]);

/** Nom de l'option DHCP posée par SafeLinkHub, par lien. */
export const wanNameOption = (iface: string) => `slh-${iface}`;

/**
 * Un nom d'hôte DHCP, et RIEN d'autre : cette chaîne part dans une commande
 * RouterOS entre apostrophes, donc tout ce qui pourrait la clore est refusé
 * ici — pas plus tard, pas ailleurs.
 */
export function nomFaiValide(label: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9-]{0,31}$/.test(label);
}

/**
 * MAC localement administrée (bit U/L posé, bit multicast à zéro), stable pour
 * un couple routeur+interface : rejouer la pose ne renégocie pas un bail à
 * chaque fois. Volontairement SANS OUI constructeur — l'objectif est qu'aucune
 * base de vendeurs ne réponde quoi que ce soit, pas de se faire passer pour le
 * matériel d'un tiers.
 */
export function macLocale(seed: string): string {
  const h = createHash("sha256").update(seed).digest();
  const octets = [0x02, h[1], h[2], h[3], h[4], h[5]];
  return octets.map((o) => o.toString(16).padStart(2, "0").toUpperCase()).join(":");
}

/** Vrai si la MAC est celle d'usine — donc si l'OUI constructeur est visible. */
export const macDUsine = (l: WanLink) =>
  Boolean(l.origMac) && l.mac.toUpperCase() === l.origMac.toUpperCase();

export function inspectWanStealth(input: WanStealthInput): StealthLeak[] {
  const leaks: StealthLeak[] = [];

  const usine = input.links.filter(macDUsine);
  if (usine.length > 0) {
    leaks.push({
      id: "mac-vendor",
      label: "Adresse MAC d'usine exposée",
      detail:
        "L'OUI de ces interfaces est déposé au nom de « Routerboard.com » : c'est ce que le FAI affiche dans sa liste d'appareils, même si un autre nom d'hôte est envoyé.",
      interfaces: usine.map((l) => l.name),
      fixable: true,
    });
  }

  const identite = input.links.filter(
    (l) => l.dhcpId && (!l.dhcpOptions || l.dhcpOptions.split(",").includes("hostname")),
  );
  if (identite.length > 0) {
    leaks.push({
      id: "hostname",
      label: "Nom du routeur envoyé au FAI",
      detail: `Le client DHCP envoie l'identité système${
        identite[0].sentHostname ? ` (« ${identite[0].sentHostname} ») ` : " "
      }dans l'option 12 de chaque bail.`,
      interfaces: identite.map((l) => l.name),
      fixable: true,
    });
  }

  if (LISTS_INCLUANT_WAN.has(input.discoverList.trim())) {
    leaks.push({
      id: "discovery",
      label: "Découverte de voisinage active côté WAN",
      detail: `« ${input.discoverList} » englobe les interfaces WAN : le routeur diffuse son modèle, sa version de RouterOS et son identité en ${
        input.discoverProtocols || "MNDP/CDP/LLDP"
      } à tout ce qui est branché en face.`,
      fixable: true,
    });
  }

  if (input.cloudDdns) {
    leaks.push({
      id: "cloud",
      label: "DDNS MikroTik actif",
      detail:
        "/ip cloud publie l'adresse publique du lien sous « …sn.mynetname.net » chez MikroTik, et signe le routeur comme un MikroTik.",
      fixable: true,
    });
  }

  if (input.openServices.length > 0) {
    leaks.push({
      id: "services",
      label: "Services d'administration sans restriction d'adresse",
      detail: `${input.openServices.join(", ")} répondent sur toutes les interfaces, WAN comprise. À restreindre depuis « Éteindre les services superflus » ou à la main — non touché ici pour ne pas risquer de couper l'accès.`,
      fixable: false,
    });
  }

  return leaks;
}

export type StealthStep = { label: string; words: string[] };

export type WanStealthOptions = {
  /** Nom à présenter au FAI ; vide = on ne touche pas au nom d'hôte. */
  label?: string;
  /** Remplacer la MAC d'usine par une MAC localement administrée. */
  spoofMac: boolean;
  /** Graine de la MAC (id du routeur) — la rend stable d'une pose à l'autre. */
  seed: string;
  /** Options DHCP déjà déclarées sur le routeur (noms), pour add vs set. */
  existingOptions: { name: string; id: string }[];
};

/**
 * Traduit l'état constaté en commandes. Ordre voulu : tout ce qui est sans
 * risque d'abord, la MAC en DERNIER — elle invalide le bail DHCP et coupe le
 * WAN quelques secondes, donc le tunnel par lequel on parle au routeur.
 */
export function buildWanStealthPlan(
  input: WanStealthInput,
  opts: WanStealthOptions,
): StealthStep[] {
  const steps: StealthStep[] = [];

  if (LISTS_INCLUANT_WAN.has(input.discoverList.trim())) {
    // La liste « LAN » est posée par l'auto-setup ; à défaut on coupe la
    // découverte partout plutôt que de deviner une liste.
    const cible = input.interfaceLists.includes("LAN") ? "LAN" : "none";
    steps.push({
      label: `Découverte de voisinage limitée à « ${cible} »`,
      words: ["/ip/neighbor/discovery-settings/set", `=discover-interface-list=${cible}`],
    });
  }

  if (input.cloudDdns) {
    steps.push({
      label: "DDNS MikroTik coupé",
      words: ["/ip/cloud/set", "=ddns-enabled=no", "=update-time=no"],
    });
  }

  const label = opts.label?.trim();
  if (label && nomFaiValide(label)) {
    for (const link of input.links) {
      if (!link.dhcpId) continue;
      const optionName = wanNameOption(link.name);
      const existing = opts.existingOptions.find((o) => o.name === optionName);
      steps.push({
        label: `${link.name} : nom annoncé « ${label} »`,
        words: existing
          ? ["/ip/dhcp-client/option/set", `=numbers=${existing.id}`, `=value='${label}'`]
          : [
              "/ip/dhcp-client/option/add",
              `=name=${optionName}`,
              "=code=12",
              `=value='${label}'`,
            ],
      });
      steps.push({
        label: `${link.name} : option 12 remplacée`,
        words: [
          "/ip/dhcp-client/set",
          `=numbers=${link.dhcpId}`,
          `=dhcp-options=${optionName},clientid`,
        ],
      });
    }
  }

  if (opts.spoofMac) {
    for (const link of input.links) {
      if (!macDUsine(link)) continue;
      steps.push({
        label: `${link.name} : MAC d'usine masquée`,
        words: [
          "/interface/ethernet/set",
          `=numbers=${link.ethId}`,
          `=mac-address=${macLocale(`${opts.seed}:${link.name}`)}`,
        ],
      });
      if (link.dhcpId) {
        steps.push({
          label: `${link.name} : bail DHCP renouvelé`,
          words: ["/ip/dhcp-client/renew", `=numbers=${link.dhcpId}`],
        });
      }
    }
  }

  return steps;
}

/** Retour à l'identité d'usine : MAC d'origine et nom d'hôte système. */
export function buildWanRestorePlan(input: WanStealthInput): StealthStep[] {
  const steps: StealthStep[] = [];
  for (const link of input.links) {
    if (link.dhcpId && link.dhcpOptions && !link.dhcpOptions.split(",").includes("hostname")) {
      steps.push({
        label: `${link.name} : nom d'hôte système rétabli`,
        words: [
          "/ip/dhcp-client/set",
          `=numbers=${link.dhcpId}`,
          "=dhcp-options=hostname,clientid",
        ],
      });
    }
    if (!macDUsine(link) && link.origMac) {
      steps.push({
        label: `${link.name} : MAC d'usine rétablie`,
        words: ["/interface/ethernet/set", `=numbers=${link.ethId}`, `=mac-address=${link.origMac}`],
      });
      if (link.dhcpId) {
        steps.push({
          label: `${link.name} : bail DHCP renouvelé`,
          words: ["/ip/dhcp-client/renew", `=numbers=${link.dhcpId}`],
        });
      }
    }
  }
  return steps;
}
