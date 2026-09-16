import type { RouterOSClient } from "./client";

/**
 * RETRAIT DE LA CONFIG DUAL WAN — l'inverse exact du générateur n8n
 * (docs/n8n/dualwan-generator.js) : chaque objet est retrouvé par la même clé
 * (commentaire, marque, nom de table, liste), jamais par numéro. Rejouable :
 * ce qui n'existe plus est simplement compté à zéro. Ne touche ni à WAN1
 * (client DHCP remis à ses valeurs d'origine, NAT conservé), ni à FastTrack,
 * ni au DNS : retirer ça couperait Internet à un routeur uniwan.
 */
const ROUTE_COMMENTS = new Set(["Sonde WAN1", "Sonde WAN2", "Main WAN1", "Main WAN2", "Marquee WAN1", "Backup WAN1", "Marquee WAN2", "Backup WAN2"]);
const TABLES = new Set(["to-WAN1", "to-WAN2"]);
const EXCLUDE_LIST = "slh-pcc-exclude";

export type RemoveDualWanOptions = {
  wan2Interface: string;
  /** Bridge LAN où remettre le port WAN2 (et lui rendre son nom d'usine) ; vide = on le laisse tel quel. */
  returnWan2ToBridge?: string;
  /** Simulation : même repérage, même rapport, aucune écriture. */
  dryRun?: boolean;
};

export type RemoveDualWanReport = Record<string, number>;

export async function removeDualWanConfig(client: RouterOSClient, opts: RemoveDualWanOptions, timeoutMs = 15000): Promise<RemoveDualWanReport> {
  const report: RemoveDualWanReport = {};
  const write = (words: string[]) => (opts.dryRun ? Promise.resolve([]) : client.talk(words, timeoutMs));
  const removeWhere = async (path: string, keep: (r: Record<string, string>) => boolean, label: string) => {
    const rows = await client.talk([`${path}/print`], timeoutMs).catch(() => []);
    const ids = rows.filter((r) => r[".id"] && keep(r)).map((r) => r[".id"]);
    if (ids.length) await write([`${path}/remove`, `=numbers=${ids.join(",")}`]);
    report[label] = ids.length;
  };

  // Ordre : ce qui référence avant ce qui est référencé (marques → routes → tables).
  await removeWhere("/ip/firewall/mangle", (r) => /^PCC (\d+\/\d+ -> WAN[12]|DNS local (udp|tcp))$/.test(r.comment ?? "") || (r.action === "mark-routing" && TABLES.has(r["new-routing-mark"] ?? "")), "mangle");
  await removeWhere("/ip/route", (r) => ROUTE_COMMENTS.has(r.comment ?? ""), "routes");
  await removeWhere("/routing/table", (r) => TABLES.has(r.name ?? ""), "tables");
  await removeWhere("/ip/firewall/nat", (r) => r.comment === "NAT WAN2" || (r.action === "masquerade" && r["out-interface"] === opts.wan2Interface), "nat");
  await removeWhere("/ip/firewall/address-list", (r) => r.list === EXCLUDE_LIST, "address_list");
  await removeWhere("/interface/list/member", (r) => r.list === "WAN" && r.interface === opts.wan2Interface, "wan_list");
  await removeWhere("/ip/dhcp-client", (r) => r.interface === opts.wan2Interface, "dhcp_wan2");

  // WAN1 : on ne retire que ce que le générateur a changé (secours lointain + script de sonde).
  const dhcp = await client.talk(["/ip/dhcp-client/print"], timeoutMs).catch(() => []);
  const wan1 = dhcp.find((r) => r.interface !== opts.wan2Interface && (r.script ?? "").includes("Sonde WAN1"));
  if (wan1?.[".id"]) {
    await write(["/ip/dhcp-client/set", `=numbers=${wan1[".id"]}`, "=default-route-distance=1", "=script="]);
    report.dhcp_wan1_restored = 1;
  }

  if (opts.returnWan2ToBridge) {
    const [eth] = await client.talk(["/interface/ethernet/print", `?name=${opts.wan2Interface}`], timeoutMs).catch(() => []);
    if (eth?.[".id"]) {
      const name = eth["default-name"] || opts.wan2Interface;
      if (name !== opts.wan2Interface) await write(["/interface/ethernet/set", `=numbers=${eth[".id"]}`, `=name=${name}`, "=comment="]);
      const ports = await client.talk(["/interface/bridge/port/print", `?interface=${name}`], timeoutMs).catch(() => []);
      if (!ports.length) await write(["/interface/bridge/port/add", `=bridge=${opts.returnWan2ToBridge}`, `=interface=${name}`]);
      report.wan2_bridged = 1;
    }
  }
  return report;
}
