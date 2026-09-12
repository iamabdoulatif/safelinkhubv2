/**
 * RÉGULATION DU TRAFIC PILOTÉE PAR n8n — la partie routeur.
 *
 * Le workflow n8n « SafeLinkHub - Regulation quota » décide (rythme du quota
 * mensuel, téléchargeurs abusifs). Ici on ne décide RIEN : on lit ce dont il a
 * besoin et on applique ce qu'il a décidé, par l'API RouterOS à travers le
 * tunnel — n8n n'a donc ni identifiant de routeur ni port WebFig exposé.
 *
 * Deux primitives, pures vis-à-vis de la base :
 *   - readRegulationInputs : compteurs WAN + sessions hotspot actives ;
 *   - applyRegulation      : file de bridage partagée (PCQ) + listes de blocage.
 */
import type { RouterOSClient } from "./client";
import { detectUplinkInterface } from "./router-lock";
import { readIfaceBytes } from "./link-usage-reader";

/** File simple posée par la régulation (mère des profils hotspot). */
export const REGULATION_QUEUE = "slh-quota";
export const ABUSE_LIST = "slh-blocked-download";
export const ABUSE_PERMANENT_LIST = "slh-permanent-blocked";
const ABUSE_RULE_COMMENT = "slh-block-download-rule";
const ABUSE_PERMANENT_RULE_COMMENT = "slh-permanent-block-rule";
const PCQ = "pcq-upload-default/pcq-download-default";

export type ActiveSession = {
  mac: string;
  address: string;
  user: string;
  bytesOut: number;
  bytesIn: number;
};

export type RegulationInputs = {
  wanInterface: string | null;
  /** rx+tx de l'interface WAN, ou null si introuvable. */
  counters: number | null;
  active: ActiveSession[];
};

export async function readRegulationInputs(
  client: RouterOSClient,
  wanInterface: string | null,
  timeoutMs = 15000,
): Promise<RegulationInputs> {
  const wan = wanInterface || (await detectUplinkInterface(client, timeoutMs));
  const counters = wan ? await readIfaceBytes(client, wan, timeoutMs) : null;
  const rows = await client.talk(["/ip/hotspot/active/print"], timeoutMs).catch(() => []);
  const active: ActiveSession[] = rows
    .filter((r) => r["mac-address"])
    .map((r) => ({
      mac: r["mac-address"]!,
      address: r.address ?? "",
      user: r.user ?? "",
      bytesOut: Number(r["bytes-out"] ?? 0),
      bytesIn: Number(r["bytes-in"] ?? 0),
    }));
  return { wanInterface: wan, counters, active };
}

export type RegulationBlock = {
  address: string;
  user: string;
  /** Minutes de blocage ; absent = définitif (déblocage manuel). */
  minutes?: number;
  comment: string;
};

export type RegulationApply = {
  /** max-limit « up/down » ; « 0/0 » retire la bride. */
  limit: string;
  blocks: RegulationBlock[];
};

async function ensureDropRule(
  client: RouterOSClient,
  list: string,
  comment: string,
  timeoutMs: number,
) {
  const existing = await client
    .talk(["/ip/firewall/filter/print", `?comment=${comment}`], timeoutMs)
    .catch(() => []);
  if (existing[0]) return;
  const all = await client.talk(["/ip/firewall/filter/print", "=.proplist=.id"], timeoutMs).catch(() => []);
  const first = all.find((r) => r[".id"])?.[".id"];
  const words = [
    "/ip/firewall/filter/add",
    "=chain=forward",
    `=src-address-list=${list}`,
    "=action=drop",
    `=comment=${comment}`,
  ];
  if (first) words.push(`=place-before=${first}`);
  await client.talk(words, timeoutMs);
}

export async function applyRegulation(
  client: RouterOSClient,
  apply: RegulationApply,
  timeoutMs = 15000,
): Promise<{ queue: "removed" | "set" | "added"; blocked: number }> {
  // ── File de bridage partagée ──
  const hotspots = await client.talk(["/ip/hotspot/print"], timeoutMs).catch(() => []);
  const target = hotspots[0]?.interface || "0.0.0.0/0";
  const [existing] = await client.talk(["/queue/simple/print", `?name=${REGULATION_QUEUE}`], timeoutMs);
  let queue: "removed" | "set" | "added";
  if (apply.limit === "0/0") {
    if (hotspots.length) {
      await client.talk(["/ip/hotspot/user/profile/set", "=numbers=[find]", "=parent-queue=none"], timeoutMs).catch(() => {});
    }
    if (existing?.[".id"]) await client.talk(["/queue/simple/remove", `=numbers=${existing[".id"]}`], timeoutMs);
    queue = "removed";
  } else {
    if (existing?.[".id"]) {
      await client.talk(
        ["/queue/simple/set", `=numbers=${existing[".id"]}`, `=max-limit=${apply.limit}`, `=queue=${PCQ}`, "=disabled=no"],
        timeoutMs,
      );
      queue = "set";
    } else {
      await client.talk(
        [
          "/queue/simple/add",
          `=name=${REGULATION_QUEUE}`,
          `=target=${target}`,
          `=max-limit=${apply.limit}`,
          `=queue=${PCQ}`,
          "=comment=SafeLinkHub regulation quota",
        ],
        timeoutMs,
      );
      queue = "added";
    }
    if (hotspots.length) {
      await client
        .talk(["/ip/hotspot/user/profile/set", "=numbers=[find]", `=parent-queue=${REGULATION_QUEUE}`], timeoutMs)
        .catch(() => {});
    }
  }

  // ── Téléchargeurs abusifs ──
  if (apply.blocks.length) {
    await ensureDropRule(client, ABUSE_LIST, ABUSE_RULE_COMMENT, timeoutMs);
    await ensureDropRule(client, ABUSE_PERMANENT_LIST, ABUSE_PERMANENT_RULE_COMMENT, timeoutMs);
  }
  let blocked = 0;
  for (const b of apply.blocks) {
    const list = b.minutes ? ABUSE_LIST : ABUSE_PERMANENT_LIST;
    const dup = await client
      .talk(["/ip/firewall/address-list/print", `?address=${b.address}`, `?list=${list}`], timeoutMs)
      .catch(() => []);
    if (dup[0]) continue;
    const words = ["/ip/firewall/address-list/add", `=address=${b.address}`, `=list=${list}`, `=comment=${b.comment}`];
    if (b.minutes) words.push(`=timeout=${Math.round(b.minutes)}m`);
    await client.talk(words, timeoutMs);
    blocked++;
  }
  return { queue, blocked };
}
