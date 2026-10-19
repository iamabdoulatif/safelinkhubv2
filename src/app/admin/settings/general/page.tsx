import { and, count, eq } from "drizzle-orm";
import { getCurrentOrganization } from "@/lib/organizations/actions";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import {
  captiveTemplates,
  paymentGateways,
  routers,
  smsGateways,
} from "@/lib/db/schema";
import GeneralSettingsOverview from "./GeneralSettingsOverview";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(date);
}

export default async function GeneralSettingsPage() {
  const [org, session] = await Promise.all([
    getCurrentOrganization(),
    getSession(),
  ]);
  if (!org || !session) return null;

  const db = getDb();
  const compter = (p: Promise<{ n: number }[]>) =>
    p.then((r) => r[0]?.n ?? 0).catch(() => null);
  const [nbRouteurs, nbPaiements, nbSms, nbPortails] = await Promise.all([
    compter(
      db.select({ n: count() }).from(routers).where(eq(routers.orgId, org.id)),
    ),
    compter(
      db
        .select({ n: count() })
        .from(paymentGateways)
        .where(
          and(
            eq(paymentGateways.orgId, org.id),
            eq(paymentGateways.enabled, true),
          ),
        ),
    ),
    compter(
      db
        .select({ n: count() })
        .from(smsGateways)
        .where(
          and(eq(smsGateways.orgId, org.id), eq(smsGateways.enabled, true)),
        ),
    ),
    compter(
      db
        .select({ n: count() })
        .from(captiveTemplates)
        .where(eq(captiveTemplates.orgId, org.id)),
    ),
  ]);

  return (
    <GeneralSettingsOverview
      organization={{
        name: org.name,
        slug: org.slug,
        accountType: org.accountType,
        createdAtLabel: formatDate(org.createdAt),
      }}
      counts={{
        routers: nbRouteurs,
        gateways: nbPaiements,
        sms: nbSms,
        portals: nbPortails,
      }}
    />
  );
}
