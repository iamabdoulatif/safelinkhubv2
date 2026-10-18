import { and, asc, eq, isNotNull, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  routerRegulation,
  routers,
  routerTrafficSamples,
  routerTrafficState,
} from "@/lib/db/schema";
import {
  advanceTrafficHistory,
  trafficBucket,
  type TrafficLink,
  type TrafficObservation,
} from "./traffic-history";
import { readTrafficObservation } from "./traffic-reader";
import { connectToRouter } from "./router-sync";
import { detectUplinkInterfaces } from "./router-lock";
import type { RouterOSClient } from "./client";

export function configuredTrafficLinks(
  router: Pick<typeof routers.$inferSelect, "linkType" | "quotaGuard">,
  links: TrafficLink[] | null,
): TrafficLink[] {
  if (links?.length)
    return links
      .filter((l) => l.id && l.interface)
      .map(({ id, name, interface: iface }) => ({
        id,
        name,
        interface: iface,
      }));
  if (router.linkType !== "starlink") return [];
  return (router.quotaGuard?.wanInterface ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((iface) => ({ id: `wan:${iface}`, name: iface, interface: iface }));
}

/** Lightweight collector first, separate from heavy health reconciliation.
 * All network reads per router share an existing DB lock, released even on
 * failures. There is exactly one sample per router and five-minute bucket. */
export async function collectTrafficHistory(budgetMs = 90000) {
  const db = getDb();
  const deadline = Date.now() + budgetMs;
  const bucket = new Date(trafficBucket(Date.now()));
  const candidates = await db
    .select({ router: routers, links: routerRegulation.fupLinks })
    .from(routers)
    .leftJoin(routerRegulation, eq(routerRegulation.routerId, routers.id))
    .leftJoin(routerTrafficState, eq(routerTrafficState.routerId, routers.id))
    .where(
      and(
        isNotNull(routers.host),
        or(
          eq(routers.linkType, "starlink"),
          sql`jsonb_array_length(coalesce(${routerRegulation.fupLinks}, '[]'::jsonb)) > 0`,
        ),
      ),
    )
    .orderBy(
      sql`${routerTrafficState.updatedAt} asc nulls first`,
      asc(routers.id),
    );
  let cursor = 0,
    recorded = 0,
    errors = 0;
  await Promise.all(
    Array.from({ length: Math.min(2, candidates.length) }, async () => {
      while (cursor < candidates.length && Date.now() < deadline) {
        const { router, links: configured } = candidates[cursor++];
        try {
          const wrote = await db.transaction(async (tx) => {
            const lock = await tx.execute(
              sql`select pg_try_advisory_xact_lock(hashtext('traffic-history'), hashtext(${router.id})) as acquired`,
            );
            if (lock.rows[0]?.acquired !== true) return false;
            const [exists] = await tx
              .select({ id: routerTrafficSamples.id })
              .from(routerTrafficSamples)
              .where(
                and(
                  eq(routerTrafficSamples.routerId, router.id),
                  eq(routerTrafficSamples.bucket, bucket),
                ),
              )
              .limit(1);
            if (exists) return false;
            const [saved] = await tx
              .select()
              .from(routerTrafficState)
              .where(eq(routerTrafficState.routerId, router.id));
            let links = configuredTrafficLinks(router, configured);
            if (!links.length && saved?.baseline)
              links = Object.entries(saved.baseline.links).map(([id, l]) => ({
                id,
                name: l.interface,
                interface: l.interface,
              }));
            let client: RouterOSClient | null = null;
            let observation: TrafficObservation;
            try {
              client = await connectToRouter(router, 7000, 1);
              if (!links.length)
                links = (await detectUplinkInterfaces(client, 4000)).map(
                  (iface) => ({
                    id: `wan:${iface}`,
                    name: iface,
                    interface: iface,
                  }),
                );
              observation = await readTrafficObservation(
                client,
                router.id,
                links,
                4000,
              );
            } catch {
              observation = {
                at: Date.now(),
                uptime: null,
                links: links.map((l) => ({
                  ...l,
                  rx: null,
                  tx: null,
                  running: null,
                })),
                clients: null,
                conditions: [],
              };
            } finally {
              client?.close();
            }
            const { state, sample } = advanceTrafficHistory(
              saved?.baseline ?? null,
              observation,
            );
            sample.bucket = bucket.getTime();
            await tx.insert(routerTrafficSamples).values({
              routerId: router.id,
              bucket,
              measuredAt: new Date(sample.at),
              payload: sample,
            });
            await tx
              .insert(routerTrafficState)
              .values({ routerId: router.id, baseline: state })
              .onConflictDoUpdate({
                target: routerTrafficState.routerId,
                set: { baseline: state, updatedAt: new Date() },
              });
            return true;
          });
          if (wrote) recorded++;
        } catch (error) {
          errors++;
          console.warn(
            JSON.stringify({
              msg: "traffic-history-failed",
              routerId: router.id,
              error: error instanceof Error ? error.message : "Unknown error",
            }),
          );
        }
      }
    }),
  );
  return { candidates: candidates.length, checked: cursor, recorded, errors };
}
