import { NextRequest, after } from "next/server";
import { getDb } from "@/lib/db";
import { routers } from "@/lib/db/schema";
import { connectToRouter } from "@/lib/mikrotik/router-sync";
import { unbindMacBoundTickets } from "@/lib/mikrotik/router-audit-fixes";
import { bearerMatches } from "@/lib/auth/bearer";

export const maxDuration = 300;

/**
 * Auto-cicatrisation FLEET-WIDE : délie les tickets hotspot épinglés à une
 * adresse MAC (un code verrouillé sur un seul téléphone → le 2ᵉ appareil est
 * refusé, et un client qui revient avec une MAC privée changée l'est aussi).
 *
 * Le portail ne grave plus de MAC à la vente (fulfill.ts) et l'anti-partage
 * passe par `shared-users` du profil : un ticket NE DOIT PAS être lié à une MAC.
 * Ce balayage nettoie les liaisons résiduelles/manuelles sur TOUT le parc, et
 * ÉPARGNE les comptes de roaming (name = MAC) — cf. unbindMacBoundTickets.
 *
 * Idempotent : un passage sur un parc déjà propre ne touche rien. Déclenché par
 * le cron VPS (slh-cron mac-unbind). Travail en arrière-plan (after) pour
 * répondre tout de suite ; borné par BUDGET_MS, la passe suivante reprend le
 * reste (chaque routeur est indépendant).
 */
const BUDGET_MS = 4 * 60 * 1000;
const CONNECT_TIMEOUT_MS = 12000;

export function GET(request: NextRequest) {
  if (!bearerMatches(request, process.env.CRON_SECRET)) {
    return new Response("Unauthorized", { status: 401 });
  }

  after(async () => {
    const started = Date.now();
    const db = getDb();
    const fleet = await db.select().from(routers);

    let scanned = 0;
    let found = 0;
    let unbound = 0;
    let unreachable = 0;
    const repaired: string[] = [];

    for (const router of fleet) {
      if (Date.now() - started > BUDGET_MS) break;
      let client;
      try {
        client = await connectToRouter(router, CONNECT_TIMEOUT_MS);
      } catch {
        unreachable += 1; // routeur hors ligne : repris au prochain passage
        continue;
      }
      try {
        const res = await unbindMacBoundTickets(client);
        scanned += 1;
        found += res.found;
        unbound += res.unbound;
        if (res.unbound > 0) repaired.push(`${router.name}(${res.unbound})`);
      } catch {
        unreachable += 1;
      } finally {
        client.close();
      }
    }

    console.log(
      JSON.stringify({
        msg: "mac-unbind",
        scanned,
        found,
        unbound,
        unreachable,
        repaired: repaired.slice(0, 20),
        ms: Date.now() - started,
      }),
    );
  });

  return new Response("ok");
}
