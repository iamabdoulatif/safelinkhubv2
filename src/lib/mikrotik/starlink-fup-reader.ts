import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routerRegulation } from "@/lib/db/schema";
import type { RouterOSClient } from "./client";
import { readIfaceBytes } from "./link-usage-reader";
import { advanceFupLedger, calculateFupBudget, fupUptimeSeconds, validateFupLinks, type FupLink } from "./starlink-fup";

/** Read each WAN separately; serialize updates to avoid counting an interval twice. */
export async function readStarlinkFup(client: RouterOSClient, routerId: string, links: FupLink[]) {
  const invalid = validateFupLinks(links);
  if (invalid) throw new Error(invalid);
  const samples: { link: FupLink; raw: number | null; at: Date }[] = [];
  for (const link of links) {
    const raw = await readIfaceBytes(client, link.interface, 15000);
    samples.push({ link, raw, at: new Date() });
  }
  const [resource] = await client.talk(["/system/resource/print", "=.proplist=uptime"], 15000);
  const uptime = fupUptimeSeconds(resource?.uptime);
  return getDb().transaction(async (tx) => {
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
