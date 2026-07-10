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
import PayMethods from "./PayMethods";

function fcfa(n: number): string {
  return `${n.toLocaleString("fr-FR")} FCFA`;
}

export default async function PortalPayPage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string; slug?: string }>;
}) {
  const { orderId, slug } = await searchParams;

  const wrap = (children: React.ReactNode) => (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        fontFamily: "system-ui, sans-serif",
        background: "#f8fafc",
        color: "#0f172a",
      }}
    >
      <div
        style={{
          maxWidth: 400,
          width: "100%",
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: 16,
          padding: 24,
        }}
      >
        {children}
      </div>
    </main>
  );

  if (!orderId || !slug) {
    return wrap(<p style={{ margin: 0, color: "#64748b" }}>Lien de paiement invalide.</p>);
  }

  const db = getDb();
  const [order] = await db
    .select({
      status: portalOrders.status,
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
    return wrap(<p style={{ margin: 0, color: "#64748b" }}>Commande introuvable.</p>);
  }

  // Déjà payée / en cours / honorée → on montre le suivi, pas un nouveau paiement.
  if (order.status !== "pending") {
    redirect(`/portal/paid?orderId=${orderId}&slug=${encodeURIComponent(slug)}`);
  }

  return wrap(
    <>
      <h1 style={{ fontSize: "1.15rem", margin: "0 0 2px" }}>Payer votre forfait</h1>
      <p style={{ margin: "0 0 4px", color: "#64748b", fontSize: ".9rem" }}>
        {order.packageName ?? "Forfait WiFi"}
      </p>
      <p style={{ margin: "0 0 18px", fontSize: "1.6rem", fontWeight: 700 }}>
        {fcfa(order.priceCents ?? 0)}
      </p>
      <PayMethods slug={slug} orderId={orderId} />
    </>,
  );
}
