import {DEFAULT_TICKET_POLICY} from "@/lib/mikrotik/fup-ticket-policy";
import { and, eq, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routerRegulation, routers } from "@/lib/db/schema";
import { platformTelegramRouterScope } from "@/lib/notifications/platform-telegram-scope";
import { n8nAuthorized, policyOf, unauthorized } from "@/lib/mikrotik/regulation-api";

export const dynamic = "force-dynamic";

/** GET — les routeurs à réguler, avec seuils et dernier état. Une ligne par routeur. */
export async function GET(request: Request) {
  if (!n8nAuthorized(request)) return unauthorized();
  const rows = await getDb()
    .select({ router: routers, regulation: routerRegulation })
    .from(routerRegulation)
    .innerJoin(routers, eq(routers.id, routerRegulation.routerId))
    // This legacy workflow sends to the platform bot: never feed tenant routers to it.
    // Tenant FUP enforcement still runs in the server cron; notifications use their own outbox.
    .where(and(
      platformTelegramRouterScope(),
      or(eq(routerRegulation.enabled, true), sql`jsonb_array_length(coalesce(${routerRegulation.fupLinks}, '[]'::jsonb)) > 0`),
    ));

  return Response.json(
    rows.map(({ router, regulation }) => ({
      routerId: router.id,
      name: router.name,
      online: router.status === "online",
      billingCycleDay: router.billingCycleDay ?? 1,
      policy: policyOf(regulation),
      state: regulation.fupLinks?.length
        ? { ...regulation.state, fupV2: regulation.fupObservation?.state }
        : regulation.state ?? null,
      watch: regulation.fupLinks?.length ? regulation.fupObservation?.watch ?? {} : regulation.watch ?? {},
      fupLinks: (regulation.fupLinks ?? []).map(l => ({ ...l, wanInterface: l.interface })),
      regulationMode: regulation.fupLinks?.length ? regulation.fupMode : "legacy",
      fupRuntime: regulation.fupRuntime,
      fupPooled: regulation.fupPooled,
      fupTicketPolicy: regulation.fupTicketPolicy??DEFAULT_TICKET_POLICY,
      fupTicketState: Object.entries(regulation.fupTicketState??{}).filter(([,s])=>s.phase!=="normal").map(([user,s])=>({user,phase:s.phase,until:s.until})),
    })),
  );
}
