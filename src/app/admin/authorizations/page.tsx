// TEMPORAIRE — dashboard superadmin unifié des demandes d'autorisation
// (Auto-Setup + Accès distant), à onglets.
// TODO: Remplacer par système de paiement intégré.

import { redirect } from "next/navigation";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { listAuthorizations } from "@/lib/billing/auto-setup-authorization-service";
import { listRemoteAccessAuthorizations } from "@/lib/billing/remote-access-authorization-service";
import AuthorizationsView from "./AuthorizationsView";

export default async function AuthorizationsPage() {
  const session = await getSession();
  if (!isSuperAdmin(session?.role)) redirect("/admin");

  const [autoSetup, remoteAccess] = await Promise.all([
    listAuthorizations(),
    listRemoteAccessAuthorizations(),
  ]);

  return <AuthorizationsView autoSetup={autoSetup} remoteAccess={remoteAccess} />;
}
