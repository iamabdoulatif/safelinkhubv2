"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { kycVerifications } from "@/lib/db/schema";
import { getSession, isSuperAdmin } from "@/lib/auth/session";

export const MAX_KYC_ATTEMPTS = 3;

/** Étapes du parcours, dans l'ordre où l'écran les affiche. */
export const KYC_STEPS = ["documents", "agreement", "review"] as const;

async function currentOrRow(orgId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(kycVerifications)
    .where(eq(kycVerifications.orgId, orgId))
    .limit(1);
  if (row) return row;
  const [cree] = await db.insert(kycVerifications).values({ orgId }).returning();
  return cree;
}

/** L'opérateur déclare avoir transmis ses pièces par le canal privé. */
export async function markDocumentsSent(formData: FormData) {
  const session = await getSession();
  if (!session) return;
  const documentType = String(formData.get("documentType") ?? "").trim();
  if (!["cni", "passeport", "permis"].includes(documentType)) return;

  const row = await currentOrRow(session.orgId);
  if (row.status === "approved") return; // rien à refaire une fois validé

  await getDb()
    .update(kycVerifications)
    .set({ status: "documents_sent", documentType, updatedAt: new Date() })
    .where(eq(kycVerifications.orgId, session.orgId));
  revalidatePath("/admin/verification");
}

/** Signature de l'accord : consentement explicite + coordonnées déclarées. */
export async function signAgreement(_prevState: unknown, formData: FormData) {
  const session = await getSession();
  if (!session) return { error: "Non authentifié." };

  const fullName = String(formData.get("fullName") ?? "").trim().slice(0, 160);
  const fullAddress = String(formData.get("fullAddress") ?? "").trim().slice(0, 300);
  const agreed = formData.get("agreed") === "on";

  if (!agreed) return { error: "Vous devez accepter les conditions pour continuer." };
  if (!fullName || !fullAddress) {
    return { error: "Le nom complet et l'adresse sont requis." };
  }

  const row = await currentOrRow(session.orgId);
  if (row.status === "approved") return { error: "Votre vérification est déjà validée." };
  if (row.attempts >= MAX_KYC_ATTEMPTS) {
    return {
      error: `Vous avez utilisé vos ${MAX_KYC_ATTEMPTS} tentatives. Contactez le support pour rouvrir le dossier.`,
    };
  }
  if (row.status === "not_started") {
    return { error: "Transmettez d'abord vos pièces à l'étape 1." };
  }

  await getDb()
    .update(kycVerifications)
    .set({
      status: "under_review",
      fullName,
      fullAddress,
      agreedAt: new Date(),
      submittedAt: new Date(),
      // Une tentative se compte à la SOUMISSION, pas au refus : sinon un
      // dossier abandonné en cours de route n'en consommerait aucune et la
      // limite ne limiterait rien.
      attempts: row.attempts + 1,
      updatedAt: new Date(),
    })
    .where(eq(kycVerifications.orgId, session.orgId));
  revalidatePath("/admin/verification");
  return { success: true as const };
}

/** Décision du superadmin. */
export async function decideVerification(formData: FormData) {
  const session = await getSession();
  if (!session || !isSuperAdmin(session.role)) return;

  const orgId = String(formData.get("orgId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const adminNote = String(formData.get("adminNote") ?? "").trim().slice(0, 500);
  if (!orgId || !["approved", "rejected"].includes(decision)) return;

  await getDb()
    .update(kycVerifications)
    .set({
      status: decision,
      adminNote: adminNote || null,
      decidedAt: new Date(),
      decidedBy: session.userId,
      updatedAt: new Date(),
    })
    .where(eq(kycVerifications.orgId, orgId));
  revalidatePath("/admin/verification");
}
