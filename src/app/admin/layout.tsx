import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import AdminSidebar from "@/components/AdminSidebar";
import { getSession, isAdminRole, isSuperAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { organizations } from "@/lib/db/schema";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session || !isAdminRole(session.role)) {
    redirect("/auth/login?callback=/admin");
  }

  const db = getDb();
  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, session.orgId))
    .limit(1);

  return (
    <div className="flex min-h-screen flex-1 bg-paper overflow-x-hidden">
      <AdminSidebar
        orgName={org?.name ?? "Organisation"}
        userName={session.name}
        userEmail={session.email}
        superadmin={isSuperAdmin(session.role)}
      />
      {/* La top bar mobile fixe (h-14, visible < lg) impose un pt de
          dégagement jusqu'au breakpoint lg inclus — md:p-6 seul l'écrasait
          et le contenu passait sous la barre entre 768 et 1023px. */}
      <main className="flex-1 w-full overflow-y-auto p-4 pt-[4.5rem] md:p-6 md:pt-[4.5rem] lg:p-8 lg:pt-8">{children}</main>
    </div>
  );
}
