export type NetworkClass = "any" | "A" | "B" | "C";

function rangeArray(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

// Picking a class narrows the /bits dropdown to that class's conventional
// range; "Any" exposes the full usable range (a /31 or /32 has no usable
// hotspot hosts, so this stops at /30).
export const CLASS_PREFIX_OPTIONS: Record<NetworkClass, number[]> = {
  any: rangeArray(1, 30),
  A: rangeArray(8, 15),
  B: rangeArray(16, 23),
  C: rangeArray(24, 30),
};

export const CLASS_DEFAULT_PREFIX: Record<NetworkClass, number> = {
  any: 24,
  A: 8,
  B: 16,
  C: 24,
};

/** Reverse lookup for pre-filling the class radio when editing an existing prefix. */
export function classForPrefix(prefixBits: number): NetworkClass {
  if (CLASS_PREFIX_OPTIONS.A.includes(prefixBits)) return "A";
  if (CLASS_PREFIX_OPTIONS.B.includes(prefixBits)) return "B";
  if (CLASS_PREFIX_OPTIONS.C.includes(prefixBits)) return "C";
  return "any";
}

export type SubnetInfo = {
  networkAddress: string;
  broadcastAddress: string;
  firstUsable: string;
  lastUsable: string;
  usableHostCount: number;
  totalAddresses: number;
  prefixBits: number;
};

function ipToInt(ip: string): number | null {
  const parts = ip.trim().split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    const v = Number(part);
    if (!Number.isInteger(v) || v < 0 || v > 255) return null;
    n = n * 256 + v;
  }
  return n >>> 0;
}

function intToIp(n: number): string {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
}

/** Computes network/broadcast/usable-range for an IPv4 address + CIDR prefix. */
export function computeSubnetInfo(ip: string, prefixBits: number): SubnetInfo | null {
  if (!Number.isInteger(prefixBits) || prefixBits < 1 || prefixBits > 30) return null;
  const ipInt = ipToInt(ip);
  if (ipInt === null) return null;

  const maskInt = prefixBits === 0 ? 0 : (0xffffffff << (32 - prefixBits)) >>> 0;
  const networkInt = (ipInt & maskInt) >>> 0;
  const totalAddresses = 2 ** (32 - prefixBits);
  const broadcastInt = (networkInt + totalAddresses - 1) >>> 0;

  return {
    networkAddress: intToIp(networkInt),
    broadcastAddress: intToIp(broadcastInt),
    firstUsable: intToIp(networkInt + 1),
    lastUsable: intToIp(broadcastInt - 1),
    usableHostCount: Math.max(totalAddresses - 2, 0),
    totalAddresses,
    prefixBits,
  };
}

const KNOWN_IMPACT_NOTES: Record<number, string> = {
  8: "Réserve tout le bloc x.0.0.0 → x.255.255.255 au hotspot (16,7M d'adresses). Aucun autre service du routeur ne pourra utiliser une IP dans ce même premier octet. Adapté seulement si vous prévoyez une croissance massive ; sinon c'est largement surdimensionné.",
  16: "Réserve x.x.0.0 → x.x.255.255 (65 534 adresses utilisables). Toujours très large pour un hotspot — pertinent uniquement pour de très gros déploiements multi-sites sur le même routeur.",
  19: "8190 adresses utilisables. Un bon compromis pour un hotspot de taille moyenne à grande (plusieurs centaines à quelques milliers de clients simultanés) sans monopoliser tout un /16 ou /8.",
  23: "510 adresses utilisables. Convient à un petit site (quelques centaines de clients maximum) et laisse le reste de l'espace d'adressage libre pour d'autres bridges/VPN/Docker sur le même routeur.",
  24: "254 adresses utilisables — le classique \"réseau /24\". Suffisant pour un petit hotspot (boutique, café, petit immeuble).",
};

/** DHCP pool range that excludes the gateway address itself. */
export function poolRangeExcludingGateway(gatewayIp: string, subnet: SubnetInfo): string {
  const gatewayInt = ipToInt(gatewayIp);
  const firstUsableInt = ipToInt(subnet.firstUsable);
  if (gatewayInt === null || firstUsableInt === null) {
    return `${subnet.firstUsable}-${subnet.lastUsable}`;
  }
  const poolStartInt = gatewayInt === firstUsableInt ? gatewayInt + 1 : firstUsableInt;
  return `${intToIp(poolStartInt)}-${subnet.lastUsable}`;
}

export function getImpactNote(prefixBits: number): string {
  return (
    KNOWN_IMPACT_NOTES[prefixBits] ??
    `${2 ** (32 - prefixBits) - 2} adresses utilisables. ${
      prefixBits < 16
        ? "Préfixe très large : réfléchissez si vous avez réellement besoin de cette capacité, elle bloque l'usage du reste du bloc pour autre chose sur ce routeur."
        : prefixBits > 24
          ? "Préfixe étroit : vérifiez que le nombre de clients simultanés attendu reste bien sous cette limite, sans quoi de nouveaux appareils ne pourront plus obtenir d'IP."
          : "Dimensionnement raisonnable pour un hotspot de taille moyenne."
    }`
  );
}
