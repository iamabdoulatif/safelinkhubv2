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
        <CreditCard className="h-5 w-5 text-ink" />
        <h1 className="text-2xl font-bold text-ink">Facturation</h1>
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        Informations sur votre organisation SafeLinkHub.
      </p>

      <div className="mt-6 border-2 border-line bg-paper p-6">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-ink-soft">Organisation</dt>
            <dd className="mt-1 font-medium text-ink">{org?.name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-sm text-ink-soft">Identifiant (slug)</dt>
            <dd className="mt-1 font-medium text-ink">{org?.slug ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-sm text-ink-soft">Membres de l&apos;équipe</dt>
            <dd className="mt-1 font-medium text-ink">{teamCount}</dd>
          </div>
          <div>
            <dt className="text-sm text-ink-soft">Client depuis</dt>
            <dd className="mt-1 font-medium text-ink">
              {org ? formatDate(org.createdAt) : "—"}
            </dd>
          </div>
        </dl>
      </div>

      <div className="mt-6 border-2 border-line bg-paper p-4 sm:p-6 hover-lift">
        <div className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-ink" />
          <h2 className="font-semibold text-ink">Portefeuille</h2>
        </div>
        <p className="mt-1 text-sm text-ink-soft">
          Sert à payer les accès VPN directs (WinBox/WebFig/SSH/MikHmon) activés depuis{" "}
          <span className="font-medium">Accès distant</span> : 1 mois ={" "}
          {formatFcfa(PERIOD_PRICE_CENTS.monthly)}, 3 mois = {formatFcfa(PERIOD_PRICE_CENTS.quarterly)}
          , 6 mois = {formatFcfa(PERIOD_PRICE_CENTS.semiannual)}, 12 mois ={" "}
          {formatFcfa(PERIOD_PRICE_CENTS.yearly)}.
        </p>

        <p className="mt-4 text-sm font-medium text-ink-soft">Solde actuel</p>
        <p
          className={`mt-1 text-3xl font-bold ${
            walletBalanceCents < 0 ? "text-red-600" : "text-ink"
          }`}
        >
          {formatFcfa(walletBalanceCents)}
        </p>
        {walletBalanceCents < 0 && (
          <p className="mt-1 text-xs text-warn">
            Solde négatif — sans incidence pour l&apos;instant : la facturation des accès VPN
            n&apos;est pas encore appliquée, chaque plan reste gratuit pour tous les utilisateurs.
          </p>
        )}

        <div className="mt-4">
          <WalletTopupModal />
        </div>

        {transactions.length === 0 ? (
          <p className="mt-5 rounded-lg border border-line-soft px-3 py-6 text-center text-sm text-ink-soft">
            Aucune transaction pour le moment.
          </p>
        ) : (
          <>
            {/* Mobile: list of compact rows instead of a 4-column table —
                date/note text wraps poorly next to the amount otherwise. */}
            <div className="mt-5 space-y-2 sm:hidden">
              {transactions.map((t) => (
                <div key={t.id} className="rounded-lg border border-line-soft p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        t.type === "topup"
                          ? "bg-clay text-ok"
                          : "bg-clay text-warn"
                      }`}
                    >
                      {t.type === "topup" ? "Dépôt" : "Débit VPN"}
                    </span>
                    <span
                      className={`font-medium ${
                        t.type === "topup" ? "text-ok" : "text-warn"
                      }`}
                    >
                      {t.type === "topup" ? "+" : "-"}
                      {formatFcfa(t.amountCents)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-ink-soft">{formatDateTime(t.createdAt)}</p>
                  {t.note && <p className="mt-0.5 text-ink-soft">{t.note}</p>}
                </div>
              ))}
            </div>

            {/* Desktop / tablet: table */}
            <div className="mt-5 hidden overflow-x-auto rounded-lg border border-line-soft sm:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line-soft bg-clay text-ink-soft">
                  <tr>
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">Montant</th>
                    <th className="px-3 py-2 font-medium">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {transactions.map((t) => (
                    <tr key={t.id}>
                      <td className="px-3 py-2 text-ink-soft">{formatDateTime(t.createdAt)}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            t.type === "topup"
                              ? "bg-clay text-ok"
                              : "bg-clay text-warn"
                          }`}
                        >
                          {t.type === "topup" ? "Dépôt" : "Débit VPN"}
                        </span>
                      </td>
                      <td
                        className={`px-3 py-2 font-medium ${
                          t.type === "topup" ? "text-ok" : "text-warn"
                        }`}
                      >
                        {t.type === "topup" ? "+" : "-"}
                        {formatFcfa(t.amountCents)}
                      </td>
                      <td className="px-3 py-2 text-ink-soft">{t.note ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="mt-6 border-2 border-line bg-paper p-6">
        <h2 className="font-semibold text-ink">Gérer votre abonnement</h2>
        <p className="mt-2 text-sm text-ink-soft">
          Le reste de la facturation SafeLinkHub n&apos;est pas encore automatisé — aucune
          autre formule, facture ou moyen de paiement n&apos;est géré depuis cette page
          pour le moment. Pour toute question sur votre abonnement, passez par
          votre canal de contact habituel avec l&apos;équipe SafeLinkHub.
        </p>
      </div>
    </div>
  );
}
