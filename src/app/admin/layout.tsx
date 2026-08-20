import { redirect } from "next/navigation";
import { connection } from "next/server";
import { eq } from "drizzle-orm";
import AdminSidebar from "@/components/AdminSidebar";
import { getSession, isAdminRole, isSuperAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { countPendingFeatureAccess } from "@/lib/billing/feature-access-service";
import { listAuthorizations } from "@/lib/billing/auto-setup-authorization-service";
import { listRemoteAccessAuthorizations } from "@/lib/billing/remote-access-authorization-service";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();
  const session = await getSession();
  if (!session || !isAdminRole(session.role)) {
    redirect("/auth/login?callback=/admin");
  }

  const superadmin = isSuperAdmin(session.role);
  const db = getDb();
  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, session.orgId))
    .limit(1);

  // Badge in-app : nombre total de demandes d'autorisation en attente (toutes
  // portes confondues). Calculé uniquement pour le superadmin.
  let pendingAuthorizations = 0;
  if (superadmin) {
    const [featurePending, autoSetup, remoteAccess] = await Promise.all([
      countPendingFeatureAccess(),
      listAuthorizations(),
      listRemoteAccessAuthorizations(),
    ]);
    pendingAuthorizations =
      featurePending +
      autoSetup.filter((r) => r.status === "pending").length +
      remoteAccess.filter((r) => r.status === "pending").length;
  }

  return (
    <div className="theme-slate flex min-h-screen flex-1 overflow-x-hidden bg-clay">
      <AdminSidebar
        orgName={org?.name ?? "Organisation"}
        userName={session.name}
        userEmail={session.email}
        superadmin={superadmin}
        pendingAuthorizations={pendingAuthorizations}
      />
      {/* La top bar mobile fixe (h-14, visible < lg) impose un pt de
          dégagement jusqu'au breakpoint lg inclus — md:p-6 seul l'écrasait
          et le contenu passait sous la barre entre 768 et 1023px. */}
      <main className="flex-1 w-full overflow-y-auto p-4 pt-[4.5rem] md:p-6 md:pt-[4.5rem] lg:p-8 lg:pt-8">{children}</main>
    </div>
  );
}
