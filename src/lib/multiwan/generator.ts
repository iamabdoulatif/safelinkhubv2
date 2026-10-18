import { UUID, validateMultiwan, type MultiwanConfig } from "./config";
export {
  defaultMultiwanConfig,
  validateMultiwan,
  MULTIWAN_PRICE_FCFA,
} from "./config";
const q = (v: string) =>
  `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\$/g, "\\$")}"`;

export function generateMultiwanScript(
  routerId: string,
  config: MultiwanConfig,
): string {
  if (!UUID.test(routerId)) throw new Error("Routeur invalide.");
  const invalid = validateMultiwan(config);
  if (invalid) throw new Error(invalid);
  const c = config,
    n = c.wans.length,
    prefix = `slh-mw-${routerId.replaceAll("-", "")}`;
  const table = (i: number) => `${prefix}-w${i + 1}`;
  const mark = (i: number) => `${prefix}-c${i + 1}`;
  const own = `^${prefix}:`;
  const routes = (t: number | null) =>
    t === null
      ? c.version === "7"
        ? " routing-table=main"
        : ""
      : c.version === "7"
        ? ` routing-table=${q(table(t))}`
        : ` routing-mark=${q(table(t))}`;
  const lines = [
    `# SafeLinkHub Multi-WAN Premium | routeur ${routerId}`,
    `# RouterOS ${c.version} | ${n} WAN | ${c.failover} | ${c.network === "routed" ? "PCC LAN routé" : "Hotspot : basculement dans la table principale"}`,
    "# Exporter une sauvegarde avant import et utiliser le Safe Mode de WinBox/Terminal.",
    "# WAN déjà adressés (DHCP ou IP statique) ; passerelles et interfaces vérifiées.",
    "# PCC répartit les connexions : un téléchargement unique ne cumule pas les débits.",
    "# Vérifier les routes DHCP/statiques et les autres règles de routage existantes.",
    "# Les routes ajoutées ont la priorité distance 1 ; une route existante de même distance peut créer de l’ECMP.",
    ":do {",
    `  :if ([:pick [/system resource get version] 0 1] != ${q(c.version)}) do={ :error "Version RouterOS différente de la configuration" }`,
  ];
  for (const name of [c.lanInterface, ...c.wans.map((w) => w.interface)])
    lines.push(
      `  :if ([:len [/interface find where name=${q(name)}]] != 1) do={ :error ${q(`Interface absente : ${name}`)} }`,
    );
  if (c.network === "routed") {
    lines.push(
      `  :if ([:len [/ip hotspot find where interface=${q(c.lanInterface)} disabled=no]] > 0) do={ :error "Hotspot actif sur ce LAN : utiliser le mode Hotspot sans PCC" }`,
    );
    lines.push(
      '  :if ([:len [/ip firewall filter find where action=fasttrack-connection disabled=no]] > 0) do={ :error "FastTrack actif : désactiver ou adapter FastTrack avant le PCC" }',
    );
  }
  // A competing main default can defeat the selected failover distance.
  lines.push(
    `  :foreach r in=[/ip route find where dst-address=0.0.0.0/0] do={`,
  );
  lines.push(
    `    :local mainRoute (${c.version === "7" ? '[/ip route get $r routing-table] = "main"' : "[:len [/ip route get $r routing-mark]] = 0"})`,
  );
  lines.push(`    :local rc [/ip route get $r comment]`);
  lines.push(
    `    :if ($mainRoute && ([/ip route get $r disabled] = false) && ([/ip route get $r distance] <= ${n}) && ([:pick $rc 0 ${prefix.length + 1}] != ${q(prefix + ":")})) do={ :error "Routes par défaut concurrentes : ajuster leurs distances avant import" }`,
  );
  lines.push(`  }`);
  lines.push(
    "  # Fin des précontrôles ; seuls les objets du module sont renouvelés.",
  );
  for (const path of [
    "ip firewall mangle",
    "ip firewall nat",
    "ip route",
    "ip firewall address-list",
  ])
    lines.push(`  /${path} remove [find where comment~${q(own)}]`);
  if (c.network === "routed" && c.version === "7")
    for (let i = 0; i < n; i++)
      lines.push(
        `  :if ([:len [/routing table find where name=${q(table(i))}]] = 0) do={ /routing table add name=${q(table(i))} fib }`,
      );
  for (let i = 0; i < n; i++)
    lines.push(
      `  /ip firewall nat add chain=srcnat src-address=${c.lanCidr} out-interface=${q(c.wans[i].interface)} action=masquerade comment=${q(`${prefix}:nat:${i}`)}`,
    );
  if (c.network === "routed") {
    for (const [i, net] of [
      c.lanCidr,
      "10.0.0.0/8",
      "172.16.0.0/12",
      "192.168.0.0/16",
      "100.64.0.0/10",
      "169.254.0.0/16",
    ].entries())
      lines.push(
        `  /ip firewall address-list add list=${q(`${prefix}-local`)} address=${net} comment=${q(`${prefix}:local:${i}`)}`,
      );
    lines.push("  :local anchor [:pick [/ip firewall mangle find] 0]");
    let ruleId = 0;
    const rule = (params: string) => {
      const comment = `${prefix}:mangle:${ruleId++}`;
      lines.push(`  /ip firewall mangle add ${params} comment=${q(comment)}`);
      lines.push(
        `  :if ([:len $anchor] > 0) do={ /ip firewall mangle move [find where comment=${q(comment)}] destination=$anchor }`,
      );
    };
    // Record inbound connections before they reach input/forward, keeping replies on the arriving WAN.
    for (let i = 0; i < n; i++)
      rule(
        `chain=prerouting in-interface=${q(c.wans[i].interface)} connection-state=new connection-mark=no-mark action=mark-connection new-connection-mark=${q(mark(i))} passthrough=yes`,
      );
    for (let i = 0; i < n; i++)
      rule(
        `chain=output connection-mark=${q(mark(i))} dst-address-type=!local action=mark-routing new-routing-mark=${q(table(i))} passthrough=no`,
      );
    for (let i = 0; i < n; i++)
      rule(
        `chain=prerouting in-interface=${q(c.lanInterface)} src-address=${c.lanCidr} dst-address-type=!local dst-address-list=!${q(`${prefix}-local`)} connection-state=new connection-mark=no-mark per-connection-classifier=both-addresses:${n}/${i} action=mark-connection new-connection-mark=${q(mark(i))} passthrough=yes`,
      );
    for (let i = 0; i < n; i++)
      rule(
        `chain=prerouting in-interface=${q(c.lanInterface)} src-address=${c.lanCidr} connection-mark=${q(mark(i))} dst-address-type=!local dst-address-list=!${q(`${prefix}-local`)} action=mark-routing new-routing-mark=${q(table(i))} passthrough=no`,
      );
  }
  const tables: (number | null)[] =
    c.network === "routed"
      ? [null, ...Array.from({ length: n }, (_, i) => i)]
      : [null];
  // Probe /32 routes are pinned to physical interfaces and cannot escape through another ISP.
  if (c.failover !== "local")
    for (let i = 0; i < n; i++) {
      for (const probe of c.failover === "hybrid"
        ? [c.wans[i].probe, c.wans[i].probe2]
        : [c.wans[i].probe]) {
        const targets = c.version === "6" ? tables : [null];
        for (const t of targets)
          lines.push(
            `  /ip route add dst-address=${probe}/32 gateway=${q(`${c.wans[i].gateway}%${c.wans[i].interface}`)} scope=10${c.failover === "hybrid" ? " check-gateway=ping" : ""}${routes(t)} comment=${q(`${prefix}:probe:${i}:${probe}:${t ?? "main"}`)}`,
          );
      }
    }
  for (const t of tables)
    for (let offset = 0; offset < n; offset++) {
      const i = ((t ?? 0) + offset) % n,
        w = c.wans[i];
      const gateways =
        c.failover === "local"
          ? [`${w.gateway}%${w.interface}`]
          : c.failover === "hybrid"
            ? [w.probe, w.probe2]
            : [w.probe];
      for (const gateway of gateways)
        lines.push(
          `  /ip route add dst-address=0.0.0.0/0 gateway=${q(c.failover !== "local" && c.version === "7" ? `${gateway}@main` : gateway)} distance=${offset + 1} check-gateway=ping${c.failover !== "local" ? " target-scope=11" : ""}${routes(t)} comment=${q(`${prefix}:default:${i}:${t ?? "main"}:${gateway}`)}`,
        );
    }
  lines.push(
    '  :put "SafeLinkHub Multi-WAN : objets générés. Vérifier les routes actives, la navigation et chaque panne WAN."',
    "}",
  );
  lines.push(
    "",
    "# RETRAIT (commandes commentées, à exécuter seulement pour retirer ce module)",
  );
  for (const path of [
    "ip firewall mangle",
    "ip firewall nat",
    "ip route",
    "ip firewall address-list",
  ])
    lines.push(`# /${path} remove [find where comment~${q(own)}]`);
  lines.push(
    "# Les tables de routage restent en place pour ne pas supprimer une table référencée par une autre règle.",
  );
  return lines.join("\n") + "\n";
}
