import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routerRegulation } from "@/lib/db/schema";

export async function storeFupObservation(routerId: string, body: unknown): Promise<boolean> {
  const b = body as { dryRun?: boolean; observationOnly?: boolean; state?: { fupV2?: Record<string, unknown> }; watch?: Record<string, unknown> } | null;
  const state = b?.state?.fupV2;
  const at = typeof state?.at === "string" ? state.at : "";
  const ms = Date.parse(at);
  if (b?.dryRun !== true || b?.observationOnly !== true || state?.mode !== "observation" ||
      !Number.isFinite(ms) || ms > Date.now() + 60000 || ms < Date.now() - 180000 ||
      !b.watch || typeof b.watch !== "object" || Array.isArray(b.watch) ||
      JSON.stringify(b).length > 1_000_000) throw new Error("Observation invalide ou périmée.");
  return getDb().transaction(async tx => {
    const [row] = await tx.select().from(routerRegulation).where(eq(routerRegulation.routerId, routerId)).for("update");
    if (!row?.fupLinks?.length) throw new Error("Liaisons FUP non configurées.");
    if (row.fupObservation && ms <= Date.parse(row.fupObservation.at)) return false;
    const changed = row.fupObservation?.state.signature !== state.signature;
    await tx.update(routerRegulation).set({ fupObservation: { at, state, watch: b.watch! } }).where(eq(routerRegulation.routerId, routerId));
    return changed;
  });
}
