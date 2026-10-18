import { createHash } from "node:crypto";
import type { RouterOSClient } from "./client";
import { fupUptimeSeconds } from "./starlink-fup";
import {
  privateGraphPrefix,
  type TrafficLink,
  type TrafficObservation,
} from "./traffic-history";

type Row = Record<string, string>;
const yes = (v: string | undefined) => v === "true" || v === "yes";
function counter(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : null;
}
const sum = (a: string | undefined, b: string | undefined) => {
  const x = counter(a),
    y = counter(b);
  return x !== null && y !== null && Number.isSafeInteger(x + y) ? x + y : null;
};

/** Passive accounting only, never a bandwidth test or an enforcement call. */
export async function readTrafficObservation(
  client: RouterOSClient,
  routerId: string,
  links: TrafficLink[],
  timeout = 5000,
): Promise<TrafficObservation> {
  const read = (words: string[]) =>
    client.talk(words, timeout).catch(() => null);
  // Serial API calls: a timed-out RouterOS session may be poisoned. Never
  // interpret a rejected command as an empty successful list.
  const interfaces = await read([
    "/interface/print",
    "=stats=",
    "=.proplist=name,rx-byte,tx-byte,running,disabled",
  ]);
  const resources = await read(["/system/resource/print", "=.proplist=uptime"]);
  const hotspot = await read([
    "/ip/hotspot/active/print",
    "=.proplist=.id,user,mac-address,bytes-in,bytes-out",
  ]);
  const ppp = await read([
    "/ppp/active/print",
    "=.proplist=.id,name,service,caller-id",
  ]);
  const queues = await read([
    "/queue/simple/print",
    "=.proplist=name,max-limit,disabled,invalid",
  ]);
  const filters = await read([
    "/ip/firewall/filter/print",
    "=.proplist=comment,disabled,invalid",
  ]);
  const observation: TrafficObservation = {
    at: Date.now(),
    uptime: fupUptimeSeconds(resources?.[0]?.uptime) ?? null,
    links: links.map((link) => {
      const row = interfaces?.find((i) => i.name === link.interface);
      return {
        ...link,
        rx: counter(row?.["rx-byte"]),
        tx: counter(row?.["tx-byte"]),
        running: row
          ? yes(row.disabled)
            ? false
            : row.running == null
              ? null
              : yes(row.running)
          : null,
      };
    }),
    clients: null,
    conditions: [],
  };
  if (hotspot !== null && ppp !== null) {
    const clients: Record<string, number | null> = {};
    const key = (prefix: string, row: Row) =>
      createHash("sha256")
        .update(
          JSON.stringify([
            routerId,
            prefix,
            row[".id"],
            row.user ?? row.name,
            row["mac-address"] ?? row["caller-id"],
          ]),
        )
        .digest("hex");
    for (const row of hotspot)
      clients[key("hotspot", row)] = sum(row["bytes-in"], row["bytes-out"]);
    for (const row of ppp) {
      const iface = interfaces?.find(
        (i) => i.name === `<${row.service ?? "pppoe"}-${row.name}>`,
      );
      clients[key("ppp", row)] = sum(iface?.["rx-byte"], iface?.["tx-byte"]);
    }
    observation.clients = clients;
  }
  for (const link of observation.links)
    if (link.running === false) {
      observation.conditions.push({
        kind: "outage",
        source: "mikrotik",
        certainty: "confirmed",
        linkId: link.id,
        evidence: `Interface ${link.interface} arrêtée ; cause fournisseur non déterminée.`,
      });
    }
  const managed = new Set([
    "slh-fup-shared",
    "slh-quota",
    "SafeLinkHub-quota-guard",
    "SafeLinkHub-wan-cap",
  ]);
  for (const queue of queues ?? []) {
    if (
      !managed.has(queue.name) ||
      yes(queue.disabled) ||
      yes(queue.invalid) ||
      !(queue["max-limit"] ?? "")
        .split("/")
        .some((rate) => parseFloat(rate) > 0)
    )
      continue;
    observation.conditions.push({
      kind: queue.name === "slh-fup-shared" ? "fup" : "restriction",
      source: "safelinkhub",
      certainty: "confirmed",
      evidence: `File ${queue.name} activée, plafond ${queue["max-limit"]} (envoi/réception).`,
    });
  }
  if (
    (filters ?? []).some(
      (f) =>
        f.comment?.startsWith("slh-fup-stop-") &&
        !yes(f.disabled) &&
        !yes(f.invalid),
    )
  ) {
    observation.conditions.push({
      kind: "restriction",
      source: "safelinkhub",
      certainty: "confirmed",
      evidence: "Suspension FUP activée sur le pare-feu MikroTik.",
    });
  }
  return observation;
}

/** Does not enable HTTP, change firewall rules or publish graph pages. */
export async function enableTrafficGraphing(
  client: RouterOSClient,
  interfaces: string[],
  allowAddress: string,
) {
  if (!privateGraphPrefix(allowAddress))
    throw new Error("Indiquez un réseau privé de gestion (CIDR IPv4).");
  const available = await client.talk(
    ["/interface/print", "=.proplist=name"],
    10000,
  );
  if (
    !interfaces.length ||
    interfaces.some((name) => !available.some((i) => i.name === name))
  )
    throw new Error("Interface WAN introuvable ; aucun graphique activé.");
  const rules = await client.talk(["/tool/graphing/interface/print"], 10000);
  await client.talk(["/tool/graphing/set", "=store-every=5min"], 10000);
  for (const name of [...new Set(interfaces)]) {
    const existing = rules.find(
      (r) => r.interface === name && r["allow-address"] === allowAddress,
    );
    if (existing && !yes(existing.disabled) && yes(existing["store-on-disk"]))
      continue;
    await client.talk(
      [
        `/tool/graphing/interface/${existing ? "set" : "add"}`,
        ...(existing
          ? [`=numbers=${existing[".id"]}`]
          : [`=interface=${name}`]),
        `=allow-address=${allowAddress}`,
        "=store-on-disk=yes",
        "=disabled=no",
      ],
      10000,
    );
  }
}
