import { eq } from "drizzle-orm";
import { CreditCard } from "lucide-react";
import { getDb } from "@/lib/db";
import { organizations, users } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(date);
}

/**
 * SafeLinkHub has no subscription/plan/invoice system yet (no Stripe or
 * similar wired in) — rather than fabricate fake invoices or a pricing
 * plan that isn't actually enforced anywhere, this shows the real account
 * info on file and how to reach support to manage billing manually.
 */
export default async function BillingPage() {
  const session = await getSession();
  const db = getDb();

  const [org] = session
    ? await db.select().from(organizations).where(eq(organizations.id, session.orgId)).limit(1)
    : [];
  const teamCount = session
    ? (await db.select({ id: users.id }).from(users).where(eq(users.orgId, session.orgId))).length
    : 0;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center gap-2">
        <CreditCard className="h-5 w-5 text-slate-700" />
        <h1 className="text-2xl font-bold text-slate-900">Facturation</h1>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Informations sur votre organisation SafeLinkHub.
      </p>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-slate-500">Organisation</dt>
            <dd className="mt-1 font-medium text-slate-900">{org?.name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-500">Identifiant (slug)</dt>
            <dd className="mt-1 font-medium text-slate-900">{org?.slug ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-500">Membres de l&apos;équipe</dt>
            <dd className="mt-1 font-medium text-slate-900">{teamCount}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-500">Client depuis</dt>
            <dd className="mt-1 font-medium text-slate-900">
              {org ? formatDate(org.createdAt) : "—"}
            </dd>
          </div>
        </dl>
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="font-semibold text-slate-900">Gérer votre abonnement</h2>
        <p className="mt-2 text-sm text-slate-500">
          La facturation SafeLinkHub n&apos;est pas encore automatisée — aucune
          formule, facture ou moyen de paiement n&apos;est géré depuis cette page
          pour le moment. Pour toute question sur votre abonnement, passez par
          votre canal de contact habituel avec l&apos;équipe SafeLinkHub.
        </p>
      </div>
    </div>
  );
}
