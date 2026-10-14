// Provisioning agent — ÉTAPE 2 : lancer le PAIEMENT par numéro de série.
//
// Crée une autorisation auto-setup liée à l'org + la série (le routeur n'existe
// pas encore, il sera créé au lancement de l'auto-setup), ouvre un checkout
// GeniusPay, et renvoie le lien. Le webhook payment.success approuve par
// référence. Superadmin : gratuit, aucun paiement.
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { autoSetupAuthorizations, users } from "@/lib/db/schema";
import { resolveAgentLinkFromRequest } from "@/lib/agent-link/service";
import { isSuperAdmin } from "@/lib/auth/session";
import { setupFeeFcfaFor } from "@/lib/safecoin/service-charges";
import { createGeniusPayment, isGeniusPayCheckoutEnabled } from "@/lib/payment-gateways/geniuspay";

export async function POST(request: Request) {
  const link = await resolveAgentLinkFromRequest(request);
  if (!link.ok) return Response.json({ error: link.reason === "expired" ? "Code expiré." : "Code invalide." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { serial?: string; supportsContainers?: boolean; wifiName?: string };
  const serial = String(body.serial ?? "").trim();
  if (!serial) return Response.json({ error: "Numéro de série requis." }, { status: 400 });

  const db = getDb();
  const [user] = link.userId
    ? await db.select({ role: users.role, email: users.email, name: users.name }).from(users).where(eq(users.id, link.userId)).limit(1)
    : [];

  if (isSuperAdmin(user?.role)) {
    return Response.json({ stage: "ready", free: true, amountFcfa: 0 });
  }
  if (!isGeniusPayCheckoutEnabled()) {
    return Response.json({ error: "Le paiement en ligne n'est pas activé. Contactez le support." }, { status: 503 });
  }

  // Déjà payé pour cette série (non consommé) ? On ne refait pas payer.
  const [paid] = await db
    .select({ id: autoSetupAuthorizations.id })
    .from(autoSetupAuthorizations)
    .where(and(
      eq(autoSetupAuthorizations.orgId, link.orgId),
      eq(autoSetupAuthorizations.serialNumber, serial),
      eq(autoSetupAuthorizations.status, "approved"),
    ))
    .limit(1);
  if (paid) return Response.json({ stage: "ready", free: false, alreadyPaid: true });

  const amountFcfa = await setupFeeFcfaFor({ supportsContainers: !!body.supportsContainers, orgId: link.orgId });

  const [row] = await db
    .insert(autoSetupAuthorizations)
    .values({
      orgId: link.orgId,
      userId: link.userId ?? null,
      requesterEmail: user?.email ?? "agent@safelinkhub.io",
      requesterName: user?.name ?? "Agent local",
      routerId: null,
      routerName: body.wifiName?.trim() || `Routeur ${serial}`,
      serialNumber: serial,
      supportsContainers: !!body.supportsContainers,
      amountFcfa,
      paymentMethod: "geniuspay",
      status: "pending",
    })
    .returning({ id: autoSetupAuthorizations.id });

  const payment = await createGeniusPayment({
    amountFcfa,
    description: `Configuration automatique — routeur ${serial}`,
    customer: user ? { name: user.name, email: user.email } : undefined,
    metadata: { kind: "auto_setup", authorizationId: row.id, orgId: link.orgId, serial },
  });

  if (!payment.ok) {
    await db.update(autoSetupAuthorizations).set({ status: "rejected", adminNote: `Échec paiement : ${payment.error}` }).where(eq(autoSetupAuthorizations.id, row.id));
    return Response.json({ error: payment.error }, { status: 502 });
  }
  await db.update(autoSetupAuthorizations).set({ paymentReference: payment.reference }).where(eq(autoSetupAuthorizations.id, row.id));

  return Response.json({ stage: "payment", amountFcfa, paymentUrl: payment.paymentUrl, reference: payment.reference, authorizationId: row.id });
}
