// Page de paiement hébergée SafeLinkHub. Elle ne crée la transaction GeniusPay
// qu'après le choix explicite du client, ce qui évite les limites des mini-
// navigateurs de portails captifs sur iPhone, Android et ordinateurs.

import type { CSSProperties, ReactNode } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations, packages, portalOrders } from "@/lib/db/schema";
import { appendPortalTheme, portalThemeFromParams, type PortalTheme } from "@/lib/portal/theme";
import PayMethods from "./PayMethods";
import styles from "../PortalExperience.module.css";

type PaySearchParams = {
  orderId?: string;
  slug?: string;
  accent?: string;
  surface?: string;
  text?: string;
};

function fcfa(amount: number): string {
  return `${amount.toLocaleString("fr-FR")} FCFA`;
}

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://safelinkhub.io").replace(/\/+$/, "");
}

function themeStyle(theme: PortalTheme): CSSProperties {
  return {
    "--portal-accent": theme.accent,
    "--portal-surface": theme.surface,
    "--portal-text": theme.text,
  } as CSSProperties;
}

function PayError({ children, theme }: { children: ReactNode; theme: PortalTheme }) {
  return (
    <main className={styles.shell} style={themeStyle(theme)}>
      <div className={styles.frame}>
        <div className={styles.statusRow}>
          <span className={styles.brand}>
            <span aria-hidden="true" className={styles.brandMark} /> SafeLinkHub
          </span>
          <span className={styles.statusPill}>Paiement Wi-Fi</span>
        </div>
        <section className={`${styles.card} ${styles.errorCard}`}>
          <p className={styles.eyebrow}>Paiement indisponible</p>
          <h1 className={styles.title}>Ce lien ne peut pas être utilisé</h1>
          <p className={styles.copy}>{children}</p>
        </section>
      </div>
    </main>
  );
}

export default async function PortalPayPage({
  searchParams,
}: {
  searchParams: Promise<PaySearchParams>;
}) {
  const params = await searchParams;
  const theme = portalThemeFromParams(params);
  const orderId = params.orderId?.trim() ?? "";
  const slug = params.slug?.trim() ?? "";

  if (!orderId || !slug) {
    return <PayError theme={theme}>Revenez au portail Wi-Fi et recommencez l&apos;achat de votre forfait.</PayError>;
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
    return <PayError theme={theme}>Cette commande est introuvable ou n&apos;appartient plus à ce portail Wi-Fi.</PayError>;
  }

  // Déjà payée / en cours / honorée : on montre le suivi, pas un nouveau paiement.
  if (order.status !== "pending") {
    redirect(
      appendPortalTheme(
        `${appUrl()}/portal/paid?orderId=${encodeURIComponent(orderId)}&slug=${encodeURIComponent(slug)}`,
        theme,
      ),
    );
  }

  return (
    <main className={styles.shell} style={themeStyle(theme)}>
      <div className={styles.frame}>
        <div className={styles.statusRow}>
          <span className={styles.brand}>
            <span aria-hidden="true" className={styles.brandMark} /> SafeLinkHub
          </span>
          <span className={styles.statusPill}>Étape 2 sur 2</span>
        </div>
        <section className={styles.card}>
          <p className={styles.eyebrow}>Paiement sécurisé</p>
          <h1 className={styles.title}>Choisissez votre moyen de paiement</h1>
          <p className={styles.copy}>Vous allez être redirigé vers le prestataire sélectionné pour finaliser votre achat.</p>

          <div className={styles.planSummary}>
            <p className={styles.planLabel}>Forfait à payer</p>
            <p className={styles.planName}>{order.packageName ?? "Forfait Wi-Fi"}</p>
            <p className={styles.planPrice}>{fcfa(order.priceCents ?? 0)}</p>
          </div>

          <PayMethods orderId={orderId} slug={slug} theme={theme} />
        </section>
      </div>
    </main>
  );
}
