// Page de paiement hébergée SafeLinkHub (safelinkhub.io). Le portail captif y
// redirige APRÈS l'OTP (voir /initiate → payUrl). Elle est fiable derrière le
// portail captif (même origine, walled-garden) et affiche les moyens de
// paiement au lieu de tomber sur le checkout hébergé GeniusPay qui ne proposait
// qu'Orange Money en USSD *144# (injouable sur iOS captif). Le client choisit un
// moyen → POST /api/portal/[slug]/pay → redirection vers le rail (ex. Wave).
//
// Habillage : charte safelinkhub.io (Slate — lime / encre / blanc), même
// squelette que /portal/purchase (PortalExperience.module.css). Le thème du
// point de vente (accent/surface/text) continue d'être TRANSMIS aux pages
// suivantes mais n'habille pas cette page : c'est SafeLinkHub qui encaisse.

import type { CSSProperties, ReactNode } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations, packages, portalOrders } from "@/lib/db/schema";
import {
  SLATE_PORTAL_THEME,
  portalCssVars,
  portalThemeFromParams,
  portalThemeSearch,
} from "@/lib/portal/theme";
import PayMethods from "./PayMethods";
import styles from "../PortalExperience.module.css";

function fcfa(n: number): string {
  return `${n.toLocaleString("fr-FR")} FCFA`;
}

function Shell({ children, error }: { children: ReactNode; error?: boolean }) {
  return (
    <main className={styles.shell} style={portalCssVars(SLATE_PORTAL_THEME) as CSSProperties}>
      <div className={styles.frame}>
        <div className={styles.statusRow}>
          <span className={styles.brand}>
            <span aria-hidden="true" className={styles.brandMark} /> SafeLinkHub
          </span>
          <span className={styles.statusPill}>Paiement sécurisé</span>
        </div>
        <section className={`${styles.card} ${error ? styles.errorCard : ""}`}>{children}</section>
      </div>
    </main>
  );
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

  if (!orderId || !slug) {
    return (
      <Shell error>
        <p className={styles.eyebrow}>Lien indisponible</p>
        <h1 className={styles.title}>Lien de paiement invalide</h1>
        <p className={styles.copy}>Repassez par le portail Wi-Fi pour choisir votre forfait.</p>
      </Shell>
    );
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
    return (
      <Shell error>
        <p className={styles.eyebrow}>Lien indisponible</p>
        <h1 className={styles.title}>Commande introuvable</h1>
        <p className={styles.copy}>Repassez par le portail Wi-Fi pour choisir votre forfait.</p>
      </Shell>
    );
  }

  // Déjà payée / en cours / honorée → on montre le suivi, pas un nouveau paiement.
  if (order.status !== "pending" || order.paymentReference) {
    redirect(
      `/portal/paid?orderId=${orderId}&slug=${encodeURIComponent(slug)}&${portalThemeSearch(theme)}`,
    );
  }

  return (
    <Shell>
      <p className={styles.eyebrow}>Achat Wi-Fi</p>
      <h1 className={styles.title}>Payer votre forfait</h1>
      <div className={styles.planSummary}>
        <p className={styles.planLabel}>Forfait sélectionné</p>
        <p className={styles.planName}>{order.packageName ?? "Forfait Wi-Fi"}</p>
        <p className={styles.planPrice}>{fcfa(order.priceCents ?? 0)}</p>
      </div>
      <PayMethods slug={slug} orderId={orderId} theme={theme} />
    </Shell>
  );
}
