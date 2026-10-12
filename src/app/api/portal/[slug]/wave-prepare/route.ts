// Prépare un paiement Wave AVANT que le client ne touche « Wave », pour que la
// tuile soit un vrai lien qr.pay.wave.com (lien universel Wave) : touché à la
// main dans la fenêtre Wi-Fi captive iOS, il part vers le navigateur puis
// l'app Wave — un écran intermédiaire de moins. Un lien construit APRÈS le
// tap (fetch asynchrone) n'est plus un geste : la fenêtre captive le
// chargerait elle-même et refuserait wave:// (RUE-NICOLAS, 12/10/2026).
//
// Le paiement est créé sur une COPIE de la commande : l'original reste
// payable par Orange/MTN/Moov (une commande ne porte qu'une référence). La
// copie non payée expire avec les autres (reconcile.ts, 3 h).
// ponytail: une copie par chargement de page captive ; dédoublonner si le
// volume de transactions GeniusPay non payées devient gênant.
import { and, eq, gte, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations, portalOrders } from "@/lib/db/schema";
import { corsJson, corsPreflight } from "@/lib/portal/cors";
import { POST as startPayment } from "../pay/route";

export function OPTIONS() {
  return corsPreflight();
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const orderId = String(body.orderId ?? "").trim();
  if (!orderId) return corsJson({ error: "Commande manquante." }, { status: 400 });

  const db = getDb();
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  if (!org) return corsJson({ error: "Organisation inconnue." }, { status: 404 });

  // Seule une commande fraîche, encore en attente et sans paiement, se copie.
  const [prev] = await db
    .select()
    .from(portalOrders)
    .where(
      and(
        eq(portalOrders.id, orderId),
        eq(portalOrders.orgId, org.id),
        eq(portalOrders.status, "pending"),
        isNull(portalOrders.paymentReference),
        gte(portalOrders.createdAt, new Date(Date.now() - 60 * 60 * 1000)),
      ),
    )
    .limit(1);
  if (!prev) return corsJson({ error: "Commande non préparable." }, { status: 409 });

  const [copy] = await db
    .insert(portalOrders)
    .values({
      orgId: org.id,
      routerId: prev.routerId,
      packageId: prev.packageId,
      phone: prev.phone,
      mac: prev.mac,
      profileName: prev.profileName,
      priceCents: prev.priceCents,
      status: "pending",
      smsStatus: "pending",
    })
    .returning({ id: portalOrders.id });

  // Même chemin que le choix « Wave » classique (routage, pays, URLs de retour).
  const res = await startPayment(
    new Request(request.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: copy.id, method: "wave", theme: body.theme }),
    }),
    { params: Promise.resolve({ slug }) },
  );
  const data = (await res.json()) as { checkoutUrl?: string; error?: string };
  if (!res.ok || !data.checkoutUrl) {
    return corsJson({ error: data.error || "Préparation Wave impossible." }, { status: 502 });
  }
  return corsJson({ orderId: copy.id, checkoutUrl: data.checkoutUrl });
}
