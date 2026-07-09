// Endpoint PUBLIC : vérifie le code OTP saisi par le client. Au succès, pose
// `verifiedAt` → /initiate autorisera le paiement pour ce numéro pendant ~30 min.
// Aucune session. Runtime Node (crypto).

import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations, portalOtps } from "@/lib/db/schema";
import { corsJson, corsPreflight } from "@/lib/portal/cors";
import { getOrgDial } from "@/lib/portal/org-dial";
import { OTP_VERIFY_TTL_MS, OTP_MAX_ATTEMPTS, hashOtpCode, toInternational } from "@/lib/portal/otp";

export function OPTIONS() {
  return corsPreflight();
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return corsJson({ verified: false, error: "Corps JSON invalide." }, { status: 400 });
  }

  const db = getDb();
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  if (!org) return corsJson({ verified: false, error: "Organisation inconnue." }, { status: 404 });

  const { dialCode } = await getOrgDial(org.id);
  const phone = toInternational(String(body.phone ?? ""), dialCode);
  const code = String(body.code ?? "").replace(/[^0-9]/g, "");
  if (phone.length < 8 || !code) {
    return corsJson({ verified: false, error: "Code invalide." }, { status: 400 });
  }

  const [row] = await db
    .select()
    .from(portalOtps)
    .where(and(eq(portalOtps.orgId, org.id), eq(portalOtps.phone, phone)))
    .limit(1);
  if (!row) {
    return corsJson({ verified: false, error: "Demandez d'abord un code." }, { status: 400 });
  }

  const now = Date.now();
  // Déjà vérifié dans la fenêtre : idempotent.
  if (row.verifiedAt && now - row.verifiedAt.getTime() < OTP_VERIFY_TTL_MS) {
    return corsJson({ verified: true });
  }
  if (row.expiresAt.getTime() < now) {
    return corsJson({ verified: false, error: "Code expiré, redemandez-en un." }, { status: 400 });
  }
  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    return corsJson(
      { verified: false, error: "Trop d'essais. Redemandez un code." },
      { status: 429 },
    );
  }

  if (hashOtpCode(org.id, phone, code) !== row.codeHash) {
    // Incrément SQL atomique : des essais concurrents ne peuvent pas écraser
    // mutuellement le compteur et contourner la limite.
    await db
      .update(portalOtps)
      .set({ attempts: sql`${portalOtps.attempts} + 1` })
      .where(eq(portalOtps.id, row.id));
    return corsJson({ verified: false, error: "Code incorrect." }, { status: 400 });
  }

  await db
    .update(portalOtps)
    .set({ verifiedAt: new Date(now) })
    .where(eq(portalOtps.id, row.id));

  return corsJson({ verified: true });
}
