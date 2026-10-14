// Provisioning depuis l'agent — ÉTAPE 1 : évaluation de la facturation.
//
// Règle (confirmée) : AUCUN routeur gratuit pour un utilisateur normal ; seul le
// SUPERADMIN configure sans frais. Ici on calcule ce qui est dû et on dit l'étape
// suivante (paiement ou prêt). Le paiement GeniusPay et l'exécution de l'auto-setup
// côté serveur sont l'incrément suivant.
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { resolveAgentLinkFromRequest } from "@/lib/agent-link/service";
import { isSuperAdmin } from "@/lib/auth/session";
import { setupFeeFcfaFor } from "@/lib/safecoin/service-charges";
import { getWalletBalanceCents } from "@/lib/wallet/balance";

export async function POST(request: Request) {
  const link = await resolveAgentLinkFromRequest(request);
  if (!link.ok) {
    return Response.json({ error: link.reason === "expired" ? "Code expiré." : "Code de liaison invalide." }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    serial?: string;
    supportsContainers?: boolean;
    forfaits?: unknown[];
  };
  if (!body.serial || !String(body.serial).trim()) {
    return Response.json({ error: "Numéro de série du routeur requis." }, { status: 400 });
  }

  const db = getDb();
  const role = link.userId
    ? (await db.select({ role: users.role }).from(users).where(eq(users.id, link.userId)).limit(1))[0]?.role
    : undefined;

  // Superadmin : gratuit.
  if (isSuperAdmin(role)) {
    return Response.json({ stage: "ready", free: true, amountFcfa: 0, reason: "superadmin" });
  }

  // Tout le monde paie, à chaque routeur.
  const amountFcfa = await setupFeeFcfaFor({ supportsContainers: !!body.supportsContainers, orgId: link.orgId });
  const walletFcfa = await getWalletBalanceCents(link.orgId);
  return Response.json({
    stage: "payment",
    free: false,
    amountFcfa,
    walletFcfa,
    canPayWallet: walletFcfa >= amountFcfa,
    reason: "billable",
  });
}
