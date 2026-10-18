/** Form defaults, price and strict validation; safe for client-side previews. */
export const MULTIWAN_PRICE_FCFA = 15_000;
export const UUID = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;
export type MultiwanWan = {
  interface: string;
  gateway: string;
  probe: string;
  probe2: string;
};
export type MultiwanConfig = {
  version: "6" | "7";
  failover: "local" | "recursive" | "hybrid";
  network: "routed" | "hotspot";
  lanInterface: string;
  lanCidr: string;
  wans: MultiwanWan[];
};
const PROBES = [
  "1.1.1.1",
  "8.8.8.8",
  "9.9.9.9",
  "208.67.222.222",
  "1.0.0.1",
  "8.8.4.4",
];
const SECOND = [
  "149.112.112.112",
  "208.67.220.220",
  "94.140.14.14",
  "94.140.15.15",
  "76.76.2.0",
  "76.76.10.0",
];
export function defaultMultiwanConfig(count = 2): MultiwanConfig {
  return {
    version: "7",
    failover: "hybrid",
    network: "routed",
    lanInterface: "bridge-LAN",
    lanCidr: "192.168.88.0/24",
    wans: Array.from({ length: Math.max(2, Math.min(6, count)) }, (_, i) => ({
      interface: `ether${i + 1}`,
      gateway: `192.168.${i + 1}.1`,
      probe: PROBES[i],
      probe2: SECOND[i],
    })),
  };
}
function ip(v: unknown): number | null {
  if (typeof v !== "string" || !/^\d{1,3}(\.\d{1,3}){3}$/.test(v)) return null;
  const parts = v.split(".");
  const p = parts.map(Number);
  if (parts.some((part,i) => String(p[i]) !== part)) return null;
  if (p.some((n) => n > 255) || p[0] === 0 || p[0] >= 224 || p[0] === 127)
    return null;
  return p.reduce((n, b) => n * 256 + b, 0);
}
const iface = (v: unknown) =>
  typeof v === "string" && /^[A-Za-z0-9_.:-]{1,64}$/.test(v);
export function validateMultiwan(input: unknown): string | null {
  if (!input || typeof input !== "object") return "Configuration invalide.";
  const c = input as MultiwanConfig;
  if (
    !["6", "7"].includes(c.version) ||
    !["local", "recursive", "hybrid"].includes(c.failover) ||
    !["routed", "hotspot"].includes(c.network)
  )
    return "Version, réseau ou mode de basculement invalide.";
  if (!iface(c.lanInterface))
    return "Nom de l’interface LAN invalide (lettres, chiffres, point, tiret ou deux-points).";
  const cidr = typeof c.lanCidr === "string" ? c.lanCidr.split("/") : [];
  const address = ip(cidr[0]);
  const bits = Number(cidr[1]);
  if (
    cidr.length !== 2 ||
    address === null ||
    !/^\d{1,2}$/.test(cidr[1]) ||
    bits < 8 ||
    bits > 30
  )
    return "Indiquez un sous-réseau LAN IPv4 entre /8 et /30.";
  if (!Array.isArray(c.wans) || c.wans.length < 2 || c.wans.length > 6)
    return "Choisissez de 2 à 6 connexions Internet.";
  const names = new Set([c.lanInterface]);
  const probes = new Set<string>();
  const gateways = new Set<string>();
  for (const w of c.wans) {
    if (!w || !iface(w.interface) || names.has(w.interface))
      return "Chaque interface WAN doit être unique et différente du LAN.";
    names.add(w.interface);
    const gw = ip(w.gateway);
    if (gw === null) return "Passerelle IPv4 invalide.";
    if (
      Math.floor(gw / 2 ** (32 - bits)) ===
      Math.floor(address / 2 ** (32 - bits))
    )
      return "Une passerelle WAN appartient au sous-réseau LAN : corrigez le chevauchement.";
    gateways.add(w.gateway);
    if (c.failover !== "local")
      for (const probe of c.failover === "hybrid"
        ? [w.probe, w.probe2]
        : [w.probe]) {
        const n = ip(probe);
        if (
          n === null ||
          probes.has(probe) ||
          probe === w.gateway ||
          Math.floor(n / 2 ** 24) === 10 ||
          Math.floor(n / 2 ** 20) === Math.floor(2886729728 / 2 ** 20) ||
          Math.floor(n / 65536) === 49320 ||
          Math.floor(n / 65536) === 43518
        )
          return "Les cibles de contrôle doivent être des IPv4 publiques distinctes et différentes des passerelles.";
        probes.add(probe);
      }
  }
  if ([...probes].some((p) => gateways.has(p)))
    return "Une cible de contrôle ne peut pas être une passerelle WAN.";
  return null;
}
