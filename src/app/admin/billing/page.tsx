import { eq, desc } from "drizzle-orm";
import { CreditCard, Wallet } from "lucide-react";
import { getDb } from "@/lib/db";
import {
  organizations,
  users,
  walletTransactions,
  safecoinAccounts,
  safecoinLedger,
  safecoinSettings,
} from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { isGeniusPayCheckoutEnabled } from "@/lib/payment-gateways/geniuspay";
import { autoSetupFeeCentsFor } from "@/lib/billing/auto-setup-pricing";
import { PERIOD_PRICE_CENTS } from "@/lib/mikrotik/billing-plans";
import WalletTopupModal from "./WalletTopupModal";
import WalletTopupReturn from "./WalletTopupReturn";
import WalletTransactions from "./WalletTransactions";
import SafecoinWalletCard from "./SafecoinWalletCard";
import SafecoinTopupReturn from "./SafecoinTopupReturn";

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
export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ topup?: string; safecoin_topup?: string; transaction?: string }>;
}) {
  const { topup, safecoin_topup: safecoinTopup, transaction } = await searchParams;
  const session = await getSession();
  const db = getDb();

  const [org] = session
    ? await db.select().from(organizations).where(eq(organizations.id, session.orgId)).limit(1)
    : [];
  const teamCount = session
    ? (await db.select({ id: users.id }).from(users).where(eq(users.orgId, session.orgId))).length
    : 0;
  const [currentUser] = session
    ? await db
        .select({ country: users.country })
        .from(users)
        .where(eq(users.id, session.userId))
        .limit(1)
    : [];

  const transactions = session
    ? await db
        .select()
        .from(walletTransactions)
        .where(eq(walletTransactions.orgId, session.orgId))
        .orderBy(desc(walletTransactions.createdAt))
    : [];
  const [safecoinAccount, safecoinRate, safecoinEntries] = session
    ? await Promise.all([
        db
          .select({ balanceScCents: safecoinAccounts.balanceScCents })
          .from(safecoinAccounts)
          .where(eq(safecoinAccounts.orgId, session.orgId))
          .limit(1),
        db
          .select({ rateFcfaPerSc: safecoinSettings.rateFcfaPerSc })
          .from(safecoinSettings)
          .limit(1),
        db
          .select({
            id: safecoinLedger.id,
            entryType: safecoinLedger.entryType,
            amountScCents: safecoinLedger.amountScCents,
            status: safecoinLedger.status,
            note: safecoinLedger.note,
            createdAt: safecoinLedger.createdAt,
          })
          .from(safecoinLedger)
          .where(eq(safecoinLedger.orgId, session.orgId))
          .orderBy(desc(safecoinLedger.createdAt))
          .limit(20),
      ])
    : [[], [], []];
  const walletBalanceCents = transactions.reduce(
    (sum, t) =>
      t.status !== "completed"
        ? sum
        : sum + (t.type === "topup" ? t.amountCents : -t.amountCents),
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
          Sert à payer les accès VPN directs (WinBox/WebFig/SSH/MikHmon) et les Auto-Setup
          supplémentaires. VPN : 1 mois ={" "}
          {formatFcfa(PERIOD_PRICE_CENTS.monthly)}, 3 mois = {formatFcfa(PERIOD_PRICE_CENTS.quarterly)}
          , 6 mois = {formatFcfa(PERIOD_PRICE_CENTS.semiannual)}, 12 mois ={" "}
          {formatFcfa(PERIOD_PRICE_CENTS.yearly)}. Auto-Setup : {formatFcfa(autoSetupFeeCentsFor(true))} avec container,
          {" "}{formatFcfa(autoSetupFeeCentsFor(false))} sans container.
        </p>

        {topup === "success" && transaction ? (
          <div className="mt-4">
            <WalletTopupReturn transactionId={transaction} />
          </div>
        ) : null}

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
            Les prochains débits VPN ou Auto-Setup nécessitent un solde positif.
          </p>
        )}

        <div className="mt-4">
          <WalletTopupModal
            defaultCountry={currentUser?.country ?? "CI"}
            geniusPayEnabled={isGeniusPayCheckoutEnabled()}
          />
        </div>

        <WalletTransactions
          transactions={transactions.map((t) => ({
            id: t.id,
            type: t.type,
            amountCents: t.amountCents,
            status: t.status,
            note: t.note,
            paymentMethod: t.paymentMethod,
            dateLabel: formatDateTime(t.createdAt),
          }))}
        />
      </div>

      <div className="mt-8">
        {safecoinTopup === "success" && transaction ? (
          <SafecoinTopupReturn transactionId={transaction} />
        ) : null}
        <SafecoinWalletCard
          balanceScCents={safecoinAccount[0]?.balanceScCents ?? 0}
          rateFcfaPerSc={safecoinRate[0]?.rateFcfaPerSc ?? 100}
          entries={safecoinEntries}
          defaultCountry={currentUser?.country ?? "CI"}
          geniusPayEnabled={isGeniusPayCheckoutEnabled()}
        />
      </div>

      <div className="mt-6 border-2 border-line bg-paper p-6">
        <h2 className="font-semibold text-ink">Gérer votre abonnement</h2>
        <p className="mt-2 text-sm text-ink-soft">
          Les dépôts en ligne sont confirmés automatiquement par la passerelle. Les
          demandes manuelles restent visibles dans le journal pour faciliter le suivi
          avec le support SafeLinkHub.
        </p>
      </div>
    </div>
  );
}
