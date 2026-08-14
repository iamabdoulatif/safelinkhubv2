// Page de paiement hébergée SafeLinkHub (safelinkhub.io). Le portail captif y
// redirige APRÈS l'OTP (voir /initiate → payUrl). Elle est fiable derrière le
// portail captif (même origine, walled-garden) et affiche les moyens de
// paiement au lieu de tomber sur le checkout hébergé GeniusPay qui ne proposait
// qu'Orange Money en USSD *144# (injouable sur iOS captif). Le client choisit un
// moyen → POST /api/portal/[slug]/pay → redirection vers le rail (ex. Wave).

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations, packages, portalOrders } from "@/lib/db/schema";
import { portalThemeFromParams, portalThemeSearch } from "@/lib/portal/theme";
import PayMethods from "./PayMethods";

function fcfa(n: number): string {
  return `${n.toLocaleString("fr-FR")} FCFA`;
}

export default async function PortalPayPage({
  searchParams,
}: {
  searchParams: Promise<{
    orderId?: string;
    slug?: string;
    accent?: string;
    surface?: string;
    text?: string;
  }>;
}) {
  const params = await searchParams;
  const { orderId, slug } = params;
  const theme = portalThemeFromParams(params);

  // Thème « Bitume » (tokens de la landing) : paper/anthracite, bordure 2px,
  // aplats opaques — pas de dégradé, pas d'ombre, angles droits.
  const wrap = (children: React.ReactNode) => (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        fontFamily: "system-ui, sans-serif",
        background: theme.surface,
        color: theme.text,
      }}
    >
      <div
        style={{
          maxWidth: 400,
          width: "100%",
          background: theme.surface,
          border: `2px solid ${theme.text}`,
          padding: 24,
        }}
      >
        {children}
      </div>
    </main>
  );

  if (!orderId || !slug) {
    return wrap(<p style={{ margin: 0, color: "#57534E" }}>Lien de paiement invalide.</p>);
  }

  const db = getDb();
  const [order] = await db
    .select({
      status: portalOrders.status,
      paymentReference: portalOrders.paymentReference,
      priceCents: portalOrders.priceCents,
      packageName: packages.name,
      orgSlug: organizations.slug,
    })
    .from(portalOrders)
    .leftJoin(packages, eq(packages.id, portalOrders.packageId))
    .leftJoin(organizations, eq(organizations.id, portalOrders.orgId))
    .where(eq(portalOrders.id, orderId))
    .limit(1);

  if (!order || order.orgSlug !== slug) {
    return wrap(<p style={{ margin: 0, color: "#57534E" }}>Commande introuvable.</p>);
  }

  // Déjà payée / en cours / honorée → on montre le suivi, pas un nouveau paiement.
  if (order.status !== "pending" || order.paymentReference) {
    redirect(
      `/portal/paid?orderId=${orderId}&slug=${encodeURIComponent(slug)}&${portalThemeSearch(theme)}`,
    );
  }

  return wrap(
    <>
      <h1 style={{ fontSize: "1.15rem", fontWeight: 800, margin: "0 0 2px" }}>
        Payer votre forfait
      </h1>
      <p style={{ margin: "0 0 4px", color: "#57534E", fontSize: ".9rem" }}>
        {order.packageName ?? "Forfait WiFi"}
      </p>
      <p
        style={{
          margin: "0 0 18px",
          fontSize: "1.6rem",
          fontWeight: 700,
          fontFamily: "'SFMono-Regular', Consolas, monospace",
        }}
      >
        {fcfa(order.priceCents ?? 0)}
      </p>
      <PayMethods slug={slug} orderId={orderId} theme={theme} />
    </>,
  );
}
