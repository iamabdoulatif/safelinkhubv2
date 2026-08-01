import type { RouterOSClient } from "./client";
import { readWifiState } from "./wifi-compat";

/**
 * OUTIL D'AUDIT MikroTik — analyse un routeur (souvent mal configuré, importé
 * ou monté à la main) au regard des bonnes pratiques de l'auto-setup SafeLinkHub,
 * puis remonte des CONSTATS (bugs, défauts) et, pour les problèmes réparables
 * en toute sécurité, un CORRECTIF applicable en un clic par l'utilisateur.
 *
 * Tout est LECTURE SEULE ici : l'audit ne modifie rien. Les correctifs sont
 * portés par des server actions dédiées (optimizeRouterWifi, optimizeRouter-
 * Throughput, setRouterBandwidthCap) et déclenchés depuis l'UI après validation.
 */

export type AuditSeverity = "error" | "warn" | "info" | "ok";
/** Correctif automatisable rattaché à un constat (mappé côté UI vers une action). */
export type AuditFixKind = "wifi" | "throughput" | "cap" | null;

export type AuditFinding = {
  id: string;
  severity: AuditSeverity;
  /** Domaine, pour le regroupement visuel. */
  area: "Débit" | "WiFi" | "Ports" | "MikHmon" | "Réseau" | "Ressources" | "Système";
  title: string;
  detail: string;
  /** Correctif applicable en un clic (null = à traiter manuellement / sur site). */
  fix: AuditFixKind;
};

export type RouterAudit = {
  board: string;
  version: string;
  uptime: string;
  cpuLoad: number;
  freeMemMb: number;
  freeHddMb: number;
  /** Santé 0-100 (100 = conforme aux bonnes pratiques). */
  score: number;
  counts: { error: number; warn: number; ok: number };
  findings: AuditFinding[];
};

const num = (v: string | undefined) => Number(v ?? 0) || 0;

export async function auditRouter(
  client: RouterOSClient,
  opts: { timeoutMs?: number } = {},
): Promise<RouterAudit> {
  const t = opts.timeoutMs ?? 20000;
  const findings: AuditFinding[] = [];
  const add = (
    severity: AuditSeverity,
    area: AuditFinding["area"],
    id: string,
    title: string,
    detail: string,
    fix: AuditFixKind = null,
  ) => findings.push({ id, severity, area, title, detail, fix });

  // ── Système / ressources ────────────────────────────────────────────────
  const res = (await client.talk(["/system/resource/print"], t).catch(() => []))[0] ?? {};
  const board = res["board-name"] ?? "Inconnu";
  const version = res.version ?? "?";
  const uptime = res.uptime ?? "?";
  const cpuLoad = num(res["cpu-load"]);
  const freeMemMb = Math.round(num(res["free-memory"]) / 1048576);
  const totalMemMb = Math.round(num(res["total-memory"]) / 1048576);
  const freeHddMb = Math.round(num(res["free-hdd-space"]) / 1048576);

  if (cpuLoad >= 85)
    add("warn", "Ressources", "cpu-high", "CPU très chargé", `Charge CPU à ${cpuLoad}% — le routeur peine, ce qui bride le débit et la réactivité.`);
  if (totalMemMb > 0 && freeMemMb / Math.max(1, totalMemMb) < 0.1)
    add("warn", "Ressources", "mem-low", "Mémoire presque saturée", `Seulement ${freeMemMb} Mo de RAM libre sur ${totalMemMb} Mo.`);
  if (freeHddMb > 0 && freeHddMb < 5)
    add("warn", "Ressources", "flash-low", "Flash presque pleine", `Seulement ${freeHddMb} Mo libres — un conteneur ou une sauvegarde peut échouer.`);

  // ── Réseau : route par défaut + NAT ─────────────────────────────────────
  const routes = await client
    .talk(["/ip/route/print", "?dst-address=0.0.0.0/0", "?active=yes"], t)
    .catch(() => []);
  if (routes.length === 0)
    add("error", "Réseau", "no-default-route", "Aucune route par défaut active", "Le routeur n'a pas de sortie Internet (WAN down, câble débranché ou DHCP WAN non obtenu).");
  else add("ok", "Réseau", "default-route", "Sortie Internet OK", "Route par défaut active présente.");

  const nat = await client.talk(["/ip/firewall/nat/print"], t).catch(() => []);
  const hasMasq = nat.some((n) => n.action === "masquerade" && n.disabled !== "true");
  if (!hasMasq)
    add("error", "Réseau", "no-nat", "Pas de NAT (masquerade)", "Aucune règle masquerade active — les clients du réseau local n'ont pas d'accès Internet.");

  // ── Débit : fasttrack + layer7 ──────────────────────────────────────────
  const filters = await client.talk(["/ip/firewall/filter/print"], t).catch(() => []);
  const hasFasttrack = filters.some((f) => f.action === "fasttrack-connection" && f.disabled !== "true");
  const activeL7 = filters.filter(
    (f) => f.chain === "forward" && f.action === "drop" && f["layer7-protocol"] && f.disabled !== "true",
  );
  if (!hasFasttrack)
    add("warn", "Débit", "no-fasttrack", "Fasttrack absent", "Sans fasttrack, tout le trafic passe par le CPU (connexion suivie + firewall complet) — débit routé bridé.", "throughput");
  else add("ok", "Débit", "fasttrack", "Fasttrack actif", "Les connexions établies sont accélérées (débit routé optimal).");
  if (activeL7.length > 0)
    add("warn", "Débit", "layer7", "Règle layer7 active (tueur de débit)", `${activeL7.length} règle(s) layer7 inspectent chaque connexion — coûteux en CPU et bride le débit.`, "throughput");

  // ── WiFi : unification du SSID (band steering) ──────────────────────────
  try {
    const wifi = await readWifiState(client, t);
    if (wifi.api === "none" || wifi.radios.length === 0) {
      add("info", "WiFi", "no-wifi", "Pas de radio WiFi", "Ce modèle n'a pas de WiFi (ou aucune radio détectée) — normal pour un routeur filaire.");
    } else {
      const named = wifi.radios.filter((r) => r.ssid && r.ssid.trim());
      const uniqueSsids = new Set(named.map((r) => r.ssid!.trim()));
      if (wifi.radios.length >= 2 && uniqueSsids.size > 1)
        add("warn", "WiFi", "ssid-split", "SSID non unifié (pas de band steering)", `Les bandes 2,4 et 5 GHz portent des noms différents (${[...uniqueSsids].join(", ")}) — les appareils ne basculent pas seuls sur la 5 GHz rapide.`, "wifi");
      else if (named.length > 0)
        add("ok", "WiFi", "ssid-ok", "WiFi unifié", "Un seul nom de réseau sur les bandes — les appareils prennent la bande la plus rapide.");
      const disabled = wifi.radios.filter((r) => r.disabled);
      if (disabled.length === wifi.radios.length && wifi.radios.length > 0)
        add("warn", "WiFi", "wifi-off", "Toutes les radios WiFi désactivées", "Aucun réseau WiFi n'est diffusé.");
    }
  } catch {
    /* WiFi indéterminable — on n'ajoute pas de constat trompeur. */
  }

  // ── Ports ethernet : négociation à 100 Mbps (goulot physique) ───────────
  try {
    const eth = await client.talk(["/interface/ethernet/print"], t).catch(() => []);
    const slow: string[] = [];
    for (const e of eth) {
      if (!e.name || e.disabled === "true") continue;
      const mon =
        (await client.talk(["/interface/ethernet/monitor", `=numbers=${e.name}`, "=once"], 8000).catch(() => []))[0] ?? {};
      if (mon.status === "link-ok" && /100Mbps/.test(mon.rate ?? "")) slow.push(e.name);
    }
    if (slow.length > 0)
      add("warn", "Ports", "eth-100m", "Port(s) à 100 Mbps (goulot physique)", `${slow.join(", ")} négocie(nt) à 100 Mbps au lieu de 1 Gbps — plafonne le débit sur ce segment. À corriger sur site : câble Cat5e/Cat6 + appareil gigabit.`);
  } catch {
    /* ignore */
  }

  // ── MikHmon : conteneur en RAM (session perdue au reboot) ───────────────
  try {
    const conts = await client.talk(["/container/print"], t).catch(() => []);
    const mk = conts.find(
      (c) => /mikhmon/i.test(String(c.name ?? "")) || /mikhmon/i.test(String(c["root-dir"] ?? "")),
    );
    if (mk) {
      const rootDir = String(mk["root-dir"] ?? "");
      if (/^\/?tmp\//.test(rootDir))
        add("warn", "MikHmon", "mikhmon-tmpfs", "MikHmon en RAM (tmpfs)", "Le conteneur MikHmon est en mémoire vive : sa session est perdue à chaque coupure de courant. Relancez l'auto-setup pour le déplacer sur la flash (persistant).");
      else add("ok", "MikHmon", "mikhmon-persist", "MikHmon persistant", "Le conteneur MikHmon survit aux reboots.");
      if (mk.running !== "true")
        add("error", "MikHmon", "mikhmon-stopped", "Conteneur MikHmon arrêté", "MikHmon n'est pas démarré — les vouchers ne sont pas gérés.");
    }
  } catch {
    /* container package absent — pas un défaut */
  }

  // ── Score de santé ──────────────────────────────────────────────────────
  const counts = {
    error: findings.filter((f) => f.severity === "error").length,
    warn: findings.filter((f) => f.severity === "warn").length,
    ok: findings.filter((f) => f.severity === "ok").length,
  };
  const score = Math.max(0, Math.min(100, 100 - counts.error * 25 - counts.warn * 10));

  // Ordre d'affichage : error d'abord, puis warn, puis ok/info.
  const rank: Record<AuditSeverity, number> = { error: 0, warn: 1, info: 2, ok: 3 };
  findings.sort((a, b) => rank[a.severity] - rank[b.severity]);

  return { board, version, uptime, cpuLoad, freeMemMb, freeHddMb, score, counts, findings };
}
