import { eq, desc } from "drizzle-orm";
import { CreditCard, Wallet } from "lucide-react";
import { getDb } from "@/lib/db";
import { organizations, users, walletTransactions } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { PERIOD_PRICE_CENTS } from "@/lib/mikrotik/billing-plans";
import WalletTopupModal from "./WalletTopupModal";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(date);
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatFcfa(cents: number) {
  return `FCFA ${cents.toLocaleString("en-US")}`;
}

/**
 * SafeLinkHub has no subscription/plan/invoice system yet (no Stripe or
 * similar wired in) — rather than fabricate fake invoices or a pricing
 * plan that isn't actually enforced anywhere, this shows the real account
 * info on file, the prepaid wallet that VPN direct-access plans charge
 * against (see lib/mikrotik/port-forward.ts), and how to reach support to
 * manage anything else manually.
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

  const transactions = session
    ? await db
        .select()
        .from(walletTransactions)
        .where(eq(walletTransactions.orgId, session.orgId))
        .orderBy(desc(walletTransactions.createdAt))
    : [];
  const walletBalanceCents = transactions.reduce(
    (sum, t) => sum + (t.type === "topup" ? t.amountCents : -t.amountCents),
    0,
  );

  return (
    <div className="mx-auto max-w-3xl animate-fade-in-up">
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

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 hover-lift">
        <div className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-slate-700" />
          <h2 className="font-semibold text-slate-900">Portefeuille</h2>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Sert à payer les accès VPN directs (WinBox/WebFig/SSH/MikHmon) activés depuis{" "}
          <span className="font-medium">Accès distant</span> : 1 mois ={" "}
          {formatFcfa(PERIOD_PRICE_CENTS.monthly)}, 3 mois = {formatFcfa(PERIOD_PRICE_CENTS.quarterly)}
          , 6 mois = {formatFcfa(PERIOD_PRICE_CENTS.semiannual)}, 12 mois ={" "}
          {formatFcfa(PERIOD_PRICE_CENTS.yearly)}.
        </p>

        <p className="mt-4 text-sm font-medium text-slate-500">Solde actuel</p>
        <p
          className={`mt-1 text-3xl font-bold ${
            walletBalanceCents < 0 ? "text-red-600" : "text-slate-900"
          }`}
        >
          {formatFcfa(walletBalanceCents)}
        </p>
        {walletBalanceCents < 0 && (
          <p className="mt-1 text-xs text-amber-600">
            Solde négatif — sans incidence pour l&apos;instant : la facturation des accès VPN
            n&apos;est pas encore appliquée, chaque plan reste gratuit pour tous les utilisateurs.
          </p>
        )}

        <div className="mt-4">
          <WalletTopupModal />
        </div>

        <div className="mt-5 overflow-hidden rounded-lg border border-slate-100">
          <div className="table-mobile-wrapper">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Montant</th>
                <th className="px-3 py-2 font-medium">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {transactions.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-slate-400">
                    Aucune transaction pour le moment.
                  </td>
                </tr>
              )}
              {transactions.map((t) => (
                <tr key={t.id}>
                  <td className="px-3 py-2 text-slate-600">{formatDateTime(t.createdAt)}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        t.type === "topup"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {t.type === "topup" ? "Dépôt" : "Débit VPN"}
                    </span>
                  </td>
                  <td
                    className={`px-3 py-2 font-medium ${
                      t.type === "topup" ? "text-emerald-700" : "text-amber-700"
                    }`}
                  >
                    {t.type === "topup" ? "+" : "-"}
                    {formatFcfa(t.amountCents)}
                  </td>
                  <td className="px-3 py-2 text-slate-500">{t.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="font-semibold text-slate-900">Gérer votre abonnement</h2>
        <p className="mt-2 text-sm text-slate-500">
          Le reste de la facturation SafeLinkHub n&apos;est pas encore automatisé — aucune
          autre formule, facture ou moyen de paiement n&apos;est géré depuis cette page
          pour le moment. Pour toute question sur votre abonnement, passez par
          votre canal de contact habituel avec l&apos;équipe SafeLinkHub.
        </p>
      </div>
    </div>
  );
}
