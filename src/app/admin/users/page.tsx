import { eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";

export default async function UsersPage() {
  const session = await getSession();
  const db = getDb();

  const orgUsers = session
    ? await db
        .select()
        .from(users)
        .where(eq(users.orgId, session.orgId))
        .orderBy(desc(users.createdAt))
    : [];

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Utilisateurs</h1>
      <p className="mt-1 text-sm text-slate-500">
        Membres de l&apos;équipe ayant accès à cette organisation SafeLinkHub.
      </p>

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Nom</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Rôle</th>
              <th className="px-4 py-3 font-medium">Inscrit le</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {orgUsers.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3 text-slate-900">{u.name}</td>
                <td className="px-4 py-3 text-slate-600">{u.email}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium capitalize text-slate-600">
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {new Intl.DateTimeFormat("fr-FR", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  }).format(u.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
