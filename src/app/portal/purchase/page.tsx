import type { CSSProperties, ReactNode } from "react";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations, packages } from "@/lib/db/schema";
import { portalThemeFromParams, type PortalTheme } from "@/lib/portal/theme";
import PurchaseFlow from "./PurchaseFlow";
import styles from "../PortalExperience.module.css";

type PurchaseSearchParams = {
  slug?: string;
  packageId?: string;
  routerId?: string;
  mac?: string;
  accent?: string;
  surface?: string;
  text?: string;
};

function themeStyle(theme: PortalTheme): CSSProperties {
  return {
    "--portal-accent": theme.accent,
    "--portal-surface": theme.surface,
    "--portal-text": theme.text,
  } as CSSProperties;
}

function hasValidMac(value: string): boolean {
  return value.replace(/[^0-9a-f]/gi, "").length === 12;
}

function PurchaseError({ children, theme }: { children: ReactNode; theme: PortalTheme }) {
  return (
    <main className={styles.shell} style={themeStyle(theme)}>
      <div className={styles.frame}>
        <div className={styles.statusRow}>
          <span className={styles.brand}>
            <span aria-hidden="true" className={styles.brandMark} /> SafeLinkHub
          </span>
          <span className={styles.statusPill}>Achat Wi-Fi</span>
        </div>
        <section aria-live="polite" className={`${styles.card} ${styles.errorCard}`}>
          <p className={styles.eyebrow}>Lien indisponible</p>
          <h1 className={styles.title}>Impossible de préparer cet achat</h1>
          <p className={styles.copy}>{children}</p>
        </section>
      </div>
    </main>
  );
}

export default async function PortalPurchasePage({
  searchParams,
}: {
  searchParams: Promise<PurchaseSearchParams>;
}) {
  const params = await searchParams;
  const theme = portalThemeFromParams(params);
  const slug = params.slug?.trim() ?? "";
  const packageId = params.packageId?.trim() ?? "";
  const routerId = params.routerId?.trim() ?? "";
  const mac = params.mac?.trim() ?? "";

  if (!slug || !packageId || !routerId || !hasValidMac(mac)) {
    return (
      <PurchaseError theme={theme}>
        Ce lien est incomplet. Revenez au portail Wi-Fi et sélectionnez à nouveau votre forfait.
      </PurchaseError>
    );
  }

  const db = getDb();
  const [pkg] = await db
    .select({ name: packages.name, priceCents: packages.priceCents })
    .from(packages)
    .innerJoin(organizations, eq(organizations.id, packages.orgId))
    .where(
      and(
        eq(packages.id, packageId),
        eq(packages.active, true),
        eq(organizations.slug, slug),
      ),
    )
    .limit(1);

  if (!pkg) {
    return (
      <PurchaseError theme={theme}>
        Ce forfait n&apos;est plus disponible. Revenez au portail Wi-Fi pour consulter les offres actives.
      </PurchaseError>
    );
  }

  return (
    <PurchaseFlow
      mac={mac}
      packageId={packageId}
      packageName={pkg.name}
      priceCents={pkg.priceCents}
      routerId={routerId}
      slug={slug}
      theme={theme}
    />
  );
}
