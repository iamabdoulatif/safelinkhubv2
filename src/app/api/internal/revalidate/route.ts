import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

/**
 * Régénère immédiatement les pages adossées à la base, juste après une bascule.
 *
 * POURQUOI CE POINT D'ENTRÉE EXISTE : le build tourne sans base (voir le
 * Dockerfile), donc ces pages sont prégénérées VIDES. Leur `revalidate` ne les
 * rafraîchit qu'une fois la fenêtre écoulée — cinq minutes pendant lesquelles
 * un visiteur verrait une landing sans chiffres et une page Formations sans
 * articles. Simplement les visiter ne sert à rien : tant que la page n'est pas
 * périmée, ISR sert le cache sans rien régénérer.
 *
 * `revalidatePath` la marque périmée tout de suite ; la requête suivante la
 * reconstruit depuis la vraie base.
 */
const PAGES = ["/", "/en", "/formations", "/en/formations", "/blog"] as const;

export async function POST(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  for (const page of PAGES) revalidatePath(page);
  return Response.json({ revalidated: PAGES });
}
