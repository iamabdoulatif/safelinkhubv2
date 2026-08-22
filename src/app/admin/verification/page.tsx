import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { kycVerifications, organizations } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { getManualPaymentContact } from "@/lib/billing/manual-payment";
import VerificationCenter from "./VerificationCenter";

export default async function VerificationPage() {
  const session = await getSession();
  if (!session) return null;

  const db = getDb();
  const [[row], [org]] = await Promise.all([
    db.select().from(kycVerifications).where(eq(kycVerifications.orgId, session.orgId)).limit(1),
    db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, session.orgId))
      .limit(1),
  ]);

  /* Le canal privé est celui des autorisations manuelles : un numéro déjà
     surveillé, plutôt qu'un second à faire vivre. */
  const { whatsappNumber } = getManualPaymentContact();
  const message = encodeURIComponent(
    `Vérification d'identité — SafeLinkHub\nOrganisation : ${org?.name ?? "?"}\nJe vous transmets ma pièce d'identité et mon justificatif de domicile.`,
  );


  return (
    <div>
      <VerificationCenter
        orgName={org?.name ?? "Votre organisation"}
        whatsappUrl={`https://wa.me/${whatsappNumber}?text=${message}`}
        verification={{
          status: row?.status ?? "not_started",
          documentType: row?.documentType ?? null,
          fullName: row?.fullName ?? null,
          fullAddress: row?.fullAddress ?? null,
          attempts: row?.attempts ?? 0,
          adminNote: row?.adminNote ?? null,
        }}
      />
    </div>
  );
}
