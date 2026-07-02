import { eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations, users } from "@/lib/db/schema";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { getVpnQuotaStatus } from "@/lib/billing/vpn-quota";
import VpnQuotaForm from "./VpnQuotaForm";

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
      <h1 className="text-2xl font-bold text-ink">Utilisateurs</h1>
      <p className="mt-1 text-sm text-ink-soft">
        {superadmin
          ? "Utilisateurs inscrits sur le SaaS et quota VPN gratuit/payant par organisation."
          : "Membres de l'équipe ayant accès à cette organisation SafeLinkHub."}
      </p>

      {/* Mobile: stacked cards — avoids a 5-6 column horizontal-scroll table
          on narrow screens, which is especially bad here since the quota
          column embeds its own select + submit button. */}
      <div className="mt-4 space-y-3 md:hidden">
        {orgUsers.map((u) => (
          <div key={u.id} className="border-2 border-line bg-paper p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium text-ink">{u.name}</p>
                <p className="truncate text-sm text-ink-soft">{u.email}</p>
              </div>
              <span className="shrink-0 rounded-full bg-clay px-2 py-0.5 text-xs font-medium capitalize text-ink-soft">
                {u.role}
              </span>
            </div>

            {superadmin && (
              <p className="mt-2 truncate text-xs text-ink-soft">{u.orgName}</p>
            )}

            <p className="mt-2 text-xs text-ink-soft">Inscrit le {formatDate(u.createdAt)}</p>

            {superadmin && (
              <div className="mt-3 border-t border-line-soft pt-3">
                <p className="mb-2 text-xs font-medium text-ink-soft">
                  Quota VPN — {quotaLabel(u)}
                </p>
                <VpnQuotaForm userId={u.id} userEmail={u.email} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Desktop / tablet: table */}
      <div className="mt-4 hidden overflow-hidden border-2 border-line bg-paper md:block">
        <div className="table-mobile-wrapper">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line-soft bg-clay text-ink-soft">
            <tr>
              <th className="px-4 py-3 font-medium">Nom</th>
              <th className="px-4 py-3 font-medium">Email</th>
              {superadmin && <th className="px-4 py-3 font-medium">Organisation</th>}
              <th className="px-4 py-3 font-medium">Rôle</th>
              {superadmin && <th className="px-4 py-3 font-medium">Quota VPN</th>}
              <th className="px-4 py-3 font-medium">Inscrit le</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {orgUsers.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3 text-ink">{u.name}</td>
                <td className="px-4 py-3 text-ink-soft">{u.email}</td>
                {superadmin && <td className="px-4 py-3 text-ink-soft">{u.orgName}</td>}
                <td className="px-4 py-3">
                  <span className="rounded-full bg-clay px-2 py-0.5 text-xs font-medium capitalize text-ink-soft">
                    {u.role}
                  </span>
                </td>
                {superadmin && (
                  <td className="px-4 py-3">
                    <div className="flex min-w-64 flex-col gap-2">
                      <span className="text-xs font-medium text-ink-soft">
                        {quotaLabel(u)}
                      </span>
                      <VpnQuotaForm userId={u.id} userEmail={u.email} />
                    </div>
                  </td>
                )}
                <td className="px-4 py-3 text-ink-soft">
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
