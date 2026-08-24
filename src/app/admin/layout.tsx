import { redirect } from "next/navigation";
import { connection } from "next/server";
import { eq } from "drizzle-orm";
import AdminSidebar from "@/components/AdminSidebar";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { isMemberRole } from "@/lib/auth/roles";
import { getDb } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { countPendingFeatureAccess } from "@/lib/billing/feature-access-service";
import { listAuthorizations } from "@/lib/billing/auto-setup-authorization-service";
import { listRemoteAccessAuthorizations } from "@/lib/billing/remote-access-authorization-service";
import Reveal from "@/components/motion/Reveal";
import { getAdminDict } from "@/lib/i18n/admin";
import { getLocale } from "@/lib/i18n/server";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();
  const [locale, dict] = await Promise.all([getLocale(), getAdminDict()]);
  /* `pendingBadge` est une fonction : elle ne peut pas traverser la frontière
     serveur/client. On la déroule ici et on n'envoie que des chaînes.
     TypeScript ne voit PAS ce problème — `dict.nav` n'étant pas un littéral,
     le contrôle des propriétés excédentaires ne s'applique pas. */
  const { pendingBadge, ...nav } = dict.nav;
  const session = await getSession();
  /* `isMemberRole` et non `isAdminRole` : l'espace s'ouvre désormais aussi aux
     Éditeurs, Agents de vente et Lecteurs. Ce qu'ils PEUVENT y faire reste
     décidé capacité par capacité — chaque action serveur garde sa propre
     garde, l'entrée ici n'accorde rien. */
  if (!session || !isMemberRole(session.role)) {
    redirect("/auth/login?callback=/admin");
  }

  const superadmin = isSuperAdmin(session.role);
  const role = session.role;
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
    /* `lang` sur le sous-arbre : le layout racine est au-dessus des routes et
       code lang="fr" en dur. Sans cela, un lecteur d'écran lirait le tableau
       de bord anglais avec la prononciation française. */
    <div lang={locale} className="theme-slate flex min-h-screen flex-1 overflow-x-hidden bg-clay">
      <AdminSidebar
        orgName={org?.name ?? "Organisation"}
        userName={session.name}
        userEmail={session.email}
        superadmin={superadmin}
        role={role}
        pendingAuthorizations={pendingAuthorizations}
        pendingLabel={
          pendingAuthorizations > 0 ? pendingBadge(pendingAuthorizations) : undefined
        }
        nav={nav}
        language={dict.language}
        locale={locale}
      />
      {/* La top bar mobile fixe (h-14, visible < lg) impose un pt de
          dégagement jusqu'au breakpoint lg inclus — md:p-6 seul l'écrasait
          et le contenu passait sous la barre entre 768 et 1023px. */}
      <main className="flex-1 w-full overflow-y-auto p-4 pt-[4.5rem] md:p-6 md:pt-[4.5rem] lg:p-8 lg:pt-8">
        {children}
        {/* Un seul observateur pour toutes les vues d'administration. */}
        <Reveal />
      </main>
    </div>
  );
}
