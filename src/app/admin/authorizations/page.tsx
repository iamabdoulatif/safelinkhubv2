// TEMPORAIRE — dashboard superadmin unifié des demandes d'autorisation
// (Auto-Setup + Accès distant), à onglets.
// TODO: Remplacer par système de paiement intégré.

import { redirect } from "next/navigation";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { listAuthorizations } from "@/lib/billing/auto-setup-authorization-service";
import { listRemoteAccessAuthorizations } from "@/lib/billing/remote-access-authorization-service";
import { listFeatureAccessAuthorizations } from "@/lib/billing/feature-access-service";
import AuthorizationsView from "./AuthorizationsView";

export default async function AuthorizationsPage() {
  const session = await getSession();
  if (!isSuperAdmin(session?.role)) redirect("/admin");

  const [autoSetup, remoteAccess, featureAccess] = await Promise.all([
    listAuthorizations(),
    listRemoteAccessAuthorizations(),
    listFeatureAccessAuthorizations(),
  ]);

  return (
    <AuthorizationsView
      autoSetup={autoSetup}
      remoteAccess={remoteAccess}
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
    />
  );
}
