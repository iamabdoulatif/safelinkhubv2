import { eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations, users } from "@/lib/db/schema";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { updateOrganizationVpnQuota } from "@/lib/billing/actions";
import { getVpnQuotaStatus, VPN_QUOTA_GRANT_OPTIONS } from "@/lib/billing/vpn-quota";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function quotaLabel(fields: { vpnQuotaMode: string | null; vpnQuotaExpiresAt: Date | null }) {
  const status = getVpnQuotaStatus(fields);
  if (status.unlimited) return "Gratuit illimité";
  if (status.paidOverride) return "VPN payant";
  if (status.free && status.expiresAt) return `Gratuit jusqu'au ${formatDate(status.expiresAt)}`;
  return "Par défaut";
}

export default async function UsersPage() {
  const session = await getSession();
  const db = getDb();
  const superadmin = isSuperAdmin(session?.role);

  const orgUsers = session
    ? superadmin
      ? await db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            role: users.role,
            createdAt: users.createdAt,
            orgId: users.orgId,
            orgName: organizations.name,
            vpnQuotaMode: organizations.vpnQuotaMode,
            vpnQuotaExpiresAt: organizations.vpnQuotaExpiresAt,
          })
          .from(users)
          .innerJoin(organizations, eq(users.orgId, organizations.id))
          .orderBy(desc(users.createdAt))
      : await db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            role: users.role,
            createdAt: users.createdAt,
            orgId: users.orgId,
            orgName: organizations.name,
            vpnQuotaMode: organizations.vpnQuotaMode,
            vpnQuotaExpiresAt: organizations.vpnQuotaExpiresAt,
          })
          .from(users)
          .innerJoin(organizations, eq(users.orgId, organizations.id))
          .where(eq(users.orgId, session.orgId))
          .orderBy(desc(users.createdAt))
    : [];

  return (
    <div className="animate-fade-in-up">
      <h1 className="text-2xl font-bold text-slate-900">Utilisateurs</h1>
      <p className="mt-1 text-sm text-slate-500">
        {superadmin
          ? "Utilisateurs inscrits sur le SaaS et quota VPN gratuit/payant par organisation."
          : "Membres de l'équipe ayant accès à cette organisation SafeLinkHub."}
      </p>

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="table-mobile-wrapper">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Nom</th>
              <th className="px-4 py-3 font-medium">Email</th>
              {superadmin && <th className="px-4 py-3 font-medium">Organisation</th>}
              <th className="px-4 py-3 font-medium">Rôle</th>
              {superadmin && <th className="px-4 py-3 font-medium">Quota VPN</th>}
              <th className="px-4 py-3 font-medium">Inscrit le</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {orgUsers.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3 text-slate-900">{u.name}</td>
                <td className="px-4 py-3 text-slate-600">{u.email}</td>
                {superadmin && <td className="px-4 py-3 text-slate-600">{u.orgName}</td>}
                <td className="px-4 py-3">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium capitalize text-slate-600">
                    {u.role}
                  </span>
                </td>
                {superadmin && (
                  <td className="px-4 py-3">
                    <div className="flex min-w-64 flex-col gap-2">
                      <span className="text-xs font-medium text-slate-600">
                        {quotaLabel(u)}
                      </span>
                      <form action={updateOrganizationVpnQuota} className="flex items-center gap-2">
                        <input type="hidden" name="userId" value={u.id} />
                        <select
                          name="grant"
                          className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700"
                          aria-label={`Quota VPN pour ${u.email}`}
                        >
                          {VPN_QUOTA_GRANT_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="submit"
                          className="h-9 rounded-md bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-700"
                        >
                          Appliquer
                        </button>
                      </form>
                    </div>
                  </td>
                )}
                <td className="px-4 py-3 text-slate-600">
                  {formatDate(u.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
