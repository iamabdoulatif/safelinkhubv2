import {runTicketPolicy} from "./fup-ticket-service";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routerRegulation, routerRegulationEvents } from "@/lib/db/schema";
import { loadRegulatedRouter } from "./regulation-api";
import { readStarlinkFup } from "./starlink-fup-reader";
import { buildFupEnforcement } from "./starlink-fup-enforcement";
import { applyFupToRouter, releaseFupFromRouter } from "./starlink-fup-router";
import { connectToRouter } from "./router-sync";

/** Single server-side authority, serialized across cron and n8n. */
export async function runStarlinkFup(routerId: string, activate = false) {
  const row = await loadRegulatedRouter(routerId);
  if (!row?.regulation.fupLinks?.length) throw new Error("Liaisons FUP non configurées.");
  if (!activate && row.regulation.fupMode !== "active") return { applied: false, changed: false, telegram: "FUP en observation." };
  const client = await connectToRouter(row.router, 20000);
  try {
    await readStarlinkFup(client, routerId, row.regulation.fupLinks);
    const result = await getDb().transaction(async tx => {
      const [current] = await tx.select().from(routerRegulation).where(eq(routerRegulation.routerId, routerId)).for("update");
      if (!current || (!activate && current.fupMode !== "active") || (current.fupPooled !== row.regulation.fupPooled || JSON.stringify(current.fupLinks) !== JSON.stringify(row.regulation.fupLinks))) throw new Error("Configuration FUP modifiée pendant le passage.");
      const plan = buildFupEnforcement(current.fupLinks!, current.fupLedger ?? {}, new Date(), current.fupPooled);
      const runtime = await applyFupToRouter(client, plan, current.fupRuntime ?? null);
      const changed = !current.fupRuntime || current.fupRuntime.stopped !== runtime.stopped || current.fupRuntime.reserve !== runtime.reserve;
      await tx.update(routerRegulation).set({ fupMode: "active", fupRuntime: runtime }).where(eq(routerRegulation.routerId, routerId));
      const telegram = `${row.router.name} : ${runtime.stopped ? "Internet suspendu : quota de gestion épuisé ; portail local conservé" : `${runtime.reserve ? "réserve" : "lissage"}, plafond partagé ${(runtime.totalBps / 1e6).toFixed(2)} Mbit/s (upload + download)`}.`;
      const message = plan.pool ? `${telegram} Enveloppe cumulée ${plan.pool.quotaGB.toFixed(0)} Go ; ${plan.pool.remainingGB!.toFixed(1)} Go restants. Tickets 2M/2M, sous plafond partagé symétrique.` : telegram;
      if (changed) await tx.insert(routerRegulationEvents).values({ routerId, kind: "fup_enforcement", payload: { ...runtime, telegram: message } });
      return { applied: true, changed, telegram: message, runtime };
    });
    const tickets=await runTicketPolicy(routerId,client,result.runtime.stopped);
    return {...result,changed:result.changed||tickets.changed,telegram:result.telegram+(tickets.telegram?"\n"+tickets.telegram:"")};
  } finally { client.close(); }
}

export async function stopStarlinkFup(routerId: string) {
  const row = await loadRegulatedRouter(routerId);
  if (!row) throw new Error("Routeur introuvable.");
  const client = await connectToRouter(row.router, 20000);
  try {
    await runTicketPolicy(routerId,client,true);
    await getDb().transaction(async tx => {
      const [current] = await tx.select().from(routerRegulation).where(eq(routerRegulation.routerId, routerId)).for("update");
      if (!current) throw new Error("Routeur introuvable.");
      await releaseFupFromRouter(client, current.fupRuntime);
      await tx.update(routerRegulation).set({ fupMode: "observation", fupRuntime: null }).where(eq(routerRegulation.routerId, routerId));
      await tx.insert(routerRegulationEvents).values({ routerId, kind: "fup_released", payload: { at: new Date().toISOString() } });
    });
  } finally { client.close(); }
}
