import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routerRegulation } from "@/lib/db/schema";
import type { RouterOSClient } from "./client";
import { readIfaceBytes } from "./link-usage-reader";
import { advanceFupLedger, calculateFupBudget, fupUptimeSeconds, validateFupLinks, type FupLink } from "./starlink-fup";

/** Read each WAN separately; serialize updates to avoid counting an interval twice. */
export async function readStarlinkFup(client: RouterOSClient, routerId: string, links: FupLink[], timeoutMs = 15000) {
  const invalid = validateFupLinks(links);
  if (invalid) throw new Error(invalid);
  const samples: { link: FupLink; raw: number | null; at: Date }[] = [];
  for (const link of links) {
    const raw = await readIfaceBytes(client, link.interface, timeoutMs);
    samples.push({ link, raw, at: new Date() });
  }
  const [resource] = await client.talk(["/system/resource/print", "=.proplist=uptime"], timeoutMs);
  const uptime = fupUptimeSeconds(resource?.uptime);
  return getDb().transaction(async (tx) => {
    // Enforcement holds this same row while talking to RouterOS. Never let
    // a telemetry request wait behind a full installation until HTTP times out.
    await tx.execute(sql`set local lock_timeout = '2s'`);
    const [current] = await tx.select().from(routerRegulation)
      .where(eq(routerRegulation.routerId, routerId)).for("update");
    if (!current || JSON.stringify(current.fupLinks) !== JSON.stringify(links)) {
      throw new Error("Configuration FUP modifiée pendant le relevé : recommencer.");
    }
    const ledger = { ...current.fupLedger };
    const measurements = samples.map(({ link, raw, at }) => {
      const next = advanceFupLedger(link, ledger[link.id] ?? null, raw, at, uptime);
      ledger[link.id] = next;
      return { id: link.id, cycleConfirmed: link.cycleConfirmed, ...next, budget: calculateFupBudget(link, next, at) };
    });
    await tx.update(routerRegulation).set({ fupLedger: ledger }).where(eq(routerRegulation.routerId, routerId));
    return measurements;
  });
}
