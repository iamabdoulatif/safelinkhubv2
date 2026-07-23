// Page « J'ai déjà payé — retrouver mon code » (safelinkhub.io, walled-garden).
// Pour le client dont le paiement mobile money s'est terminé sur le téléphone
// et dont le navigateur n'est jamais revenu afficher le code : il saisit son
// numéro et récupère son code (copie / SMS / connexion auto).

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { getOrgDial } from "@/lib/portal/org-dial";
import { COUNTRIES, countryFlag } from "@/lib/intl/countries";
import RecoverCode from "./RecoverCode";

export default async function PortalRecoverPage({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string }>;
}) {
  const { slug } = await searchParams;

  const wrap = (children: React.ReactNode) => (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "system-ui, sans-serif",
        background: "#FBFAF8",
        color: "#1C1917",
      }}
    >
      {children}
    </main>
  );

  if (!slug) {
    return wrap(<p style={{ margin: 0, color: "#57534E" }}>Lien invalide.</p>);
  }

  const db = getDb();
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  if (!org) {
    return wrap(<p style={{ margin: 0, color: "#57534E" }}>Organisation inconnue.</p>);
  }

  const { dialCode } = await getOrgDial(org.id);
  const countries = COUNTRIES.filter((c) => c.iso2 !== "XX").map((c) => ({
    d: c.dialCode,
    f: countryFlag(c.iso2),
    n: c.name,
  }));

  return wrap(<RecoverCode slug={slug} defaultDial={dialCode} countries={countries} />);
}
