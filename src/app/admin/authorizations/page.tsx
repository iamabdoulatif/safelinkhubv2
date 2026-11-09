// TEMPORAIRE — dashboard superadmin unifié des demandes d'autorisation
// (Auto-Setup + Accès distant), à onglets.
// TODO: Remplacer par système de paiement intégré.

import { redirect } from "next/navigation";
import { inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { listAuthorizations } from "@/lib/billing/auto-setup-authorization-service";
import { listRemoteAccessAuthorizations } from "@/lib/billing/remote-access-authorization-service";
import { listFeatureAccessAuthorizations } from "@/lib/billing/feature-access-service";
import { listSerialUnlockRequests } from "@/lib/mikrotik/serial-unlock-service";
import { mikrotikKindLabel } from "@/lib/billing/auto-setup-gate-config";
import { serviceLabel, periodLabel } from "@/lib/billing/remote-access-gate-config";
import { authorizationsCsv } from "@/lib/billing/authorizations-csv";
import AuthorizationsView from "./AuthorizationsView";

/** Lien `data:` téléchargeable (BOM UTF-8 pour qu'Excel lise les accents). */
function csvHref(csv: string): string {
  return `data:text/csv;charset=utf-8,${encodeURIComponent(`﻿${csv}`)}`;
}

export default async function AuthorizationsPage() {
  const session = await getSession();
  if (!isSuperAdmin(session?.role)) redirect("/admin");

  const [autoSetup, remoteAccess, featureAccess, serialUnlock] = await Promise.all([
    listAuthorizations(),
    listRemoteAccessAuthorizations(),
    listFeatureAccessAuthorizations(),
    listSerialUnlockRequests(),
  ]);

  // Le téléphone du client vit sur la fiche utilisateur, pas sur la demande :
  // on le joint pour le récapitulatif GeniusPay (une seule requête groupée).
  const userIds = [...new Set([...autoSetup, ...remoteAccess].map((r) => r.userId).filter((id): id is string => Boolean(id)))];
  const phoneRows = userIds.length
    ? await getDb()
        .select({ id: users.id, phone: users.phone, dial: users.phoneDialCode })
        .from(users)
        .where(inArray(users.id, userIds))
    : [];
  const phoneById = new Map(phoneRows.map((u) => [u.id, u.phone ? `${u.dial ?? ""}${u.phone}` : ""]));
  const phoneFor = (userId: string | null) => (userId ? phoneById.get(userId) ?? null : null);

  const autoSetupCsvHref = csvHref(
    authorizationsCsv(
      "Type",
      autoSetup.map((r) => ({
        createdAt: r.createdAt,
        paymentReference: r.paymentReference,
        requesterName: r.requesterName,
        requesterEmail: r.requesterEmail,
        phone: phoneFor(r.userId),
        detail: mikrotikKindLabel(r.supportsContainers),
        routerName: r.routerName,
        amountFcfa: r.amountFcfa,
        paymentMethod: r.paymentMethod,
        status: r.status,
      })),
    ),
  );
  const remoteAccessCsvHref = csvHref(
    authorizationsCsv(
      "Service",
      remoteAccess.map((r) => ({
        createdAt: r.createdAt,
        paymentReference: r.paymentReference,
        requesterName: r.requesterName,
        requesterEmail: r.requesterEmail,
        phone: phoneFor(r.userId),
        detail: `${serviceLabel(r.service)} — ${periodLabel(r.billingPeriod)}`,
        routerName: r.routerName,
        amountFcfa: r.amountFcfa,
        paymentMethod: r.paymentMethod,
        status: r.status,
      })),
    ),
  );

  return (
    <AuthorizationsView
      autoSetup={autoSetup}
      remoteAccess={remoteAccess}
      autoSetupCsvHref={autoSetupCsvHref}
      remoteAccessCsvHref={remoteAccessCsvHref}
      featureAccess={featureAccess.map((r) => ({
        id: r.id,
        requesterName: r.requesterName,
        requesterEmail: r.requesterEmail,
        feature: r.feature,
        note: r.note,
        status: r.status,
        createdAt: r.createdAt,
        decidedAt: r.decidedAt,
      }))}
      serialUnlock={serialUnlock.map((r) => ({
        id: r.id,
        requesterName: r.requesterName,
        requesterEmail: r.requesterEmail,
        serialNumber: r.serialNumber,
        routerName: r.routerName,
        note: r.note,
        status: r.status,
        createdAt: r.createdAt,
        decidedAt: r.decidedAt,
      }))}
    />
  );
}
