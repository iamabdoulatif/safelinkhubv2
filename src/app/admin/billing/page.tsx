import { eq, desc } from "drizzle-orm";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
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
import WalletTopupModal from "./WalletTopupModal";
import {
  resellerState,
  RESELLER_PACK_FCFA,
  RESELLER_QUOTA,
  RESELLER_SETUP_FEE_CENTS,
} from "@/lib/billing/reseller";
import WalletTopupReturn from "./WalletTopupReturn";
import WalletTransactions from "./WalletTransactions";
import SafecoinWalletCard from "./SafecoinWalletCard";
import SafecoinTopupReturn from "./SafecoinTopupReturn";
import ReferralCard from "./ReferralCard";
import PricingTable from "./PricingTable";
import { BOUTON_SOLDE } from "./ui";
import { getReferralSummary } from "@/lib/referrals/service";
import { getAppUrl } from "@/lib/net/app-url";
import { getKycStatus, kycThresholdNotice, KYC_WARNING_FCFA } from "@/lib/kyc/gate";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(date);
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatFcfa(cents: number) {
  return `FCFA ${cents.toLocaleString("fr-FR")}`;
}

/**
 * SafeLinkHub n'a pas d'abonnement ni de facture : rien à afficher de ce
 * côté-là tant que ce n'est pas branché. La page répond donc aux trois seules
 * questions qu'on vient s'y poser, dans cet ordre : combien me reste-t-il,
 * combien coûte ce que je m'apprête à faire, et qu'est-ce qui a été débité.
 *
 * Les deux portefeuilles (FCFA et Safecoin) portent désormais la MÊME forme de
 * carte — solde à gauche, bouton de rechargement à droite, journal en dessous.
 * Le crédit interne s'affichait auparavant dans un bandeau noir à ombre portée
 * qui n'avait rien à voir avec son voisin : deux traitements pour deux choses
 * qui se manipulent pareil, l'œil croyait à deux fonctionnalités distinctes.
 *
 * L'identité de l'organisation (nom, slug, membres, ancienneté) tenait la
 * première carte de la page. Elle ne se lit qu'une fois dans une vie de compte
 * et ne se décide jamais : elle est passée en pied de page.
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
  // Parrainage. Tolérant à l'ordre migration/déploiement (même garde-fou que la
  // page sauvegardes) : sans la table, la carte disparaît au lieu de casser
  // toute la facturation.
  const referral = session
    ? await getReferralSummary(session.orgId).catch(() => null)
    : null;
  const [currentUser] = session
    ? await db
        .select({ country: users.country })
        .from(users)
        .where(eq(users.id, session.userId))
        .limit(1)
    : [];

  // État revendeur — tolérant au schéma en retard : sans les colonnes, aucune
  // carte de pack ne s'affiche, jamais l'inverse.
  const [orgRow] = session
    ? await db
        .select({
          accountType: organizations.accountType,
          resellerActivatedAt: organizations.resellerActivatedAt,
          resellerExpiresAt: organizations.resellerExpiresAt,
          resellerQuotaUsed: organizations.resellerQuotaUsed,
        })
        .from(organizations)
        .where(eq(organizations.id, session.orgId))
        .limit(1)
        .catch(() => [])
    : [];
  const reseller = orgRow ? resellerState(orgRow) : null;

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
  /* Cumul des rechargements confirmés : la liste complète est DÉJÀ chargée
     ci-dessus, inutile d'une seconde requête. Seul le statut du dossier KYC
     est à lire — et seulement si le palier d'avertissement est atteint. */
  const cumulTopupFcfa = transactions.reduce(
    (sum, t) => (t.status === "completed" && t.type === "topup" ? sum + t.amountCents : sum),
    0,
  );
  const avisKyc =
    session && cumulTopupFcfa >= KYC_WARNING_FCFA
      ? kycThresholdNotice({ cumulFcfa: cumulTopupFcfa, kycStatus: await getKycStatus(session.orgId) })
      : null;
  const walletBalanceCents = transactions.reduce(
    (sum, t) =>
      t.status !== "completed"
        ? sum
        : sum + (t.type === "topup" ? t.amountCents : -t.amountCents),
    0,
  );
  const rateFcfaPerSc = safecoinRate[0]?.rateFcfaPerSc ?? 100;

  return (
    <div className="mx-auto max-w-4xl animate-fade-in-up space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-ink">Facturation</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Ce que vous pouvez dépenser, ce que ça coûte, et ce qui a déjà été débité.
        </p>
      </header>

      {/* On prévient AVANT de bloquer : découvrir la règle au moment du refus,
          c'est un rechargement raté et un appel au support. */}
      {avisKyc && (
        <div
          role={avisKyc.ton === "blocage" ? "alert" : undefined}
          className={`flex items-start gap-3 rounded-xl border p-4 sm:p-5 ${
            avisKyc.ton === "blocage"
              ? "border-err bg-err-soft"
              : "border-brand-deep bg-brand/15"
          }`}
        >
          <ShieldAlert className="mt-0.5 h-5 w-5 flex-shrink-0 text-ink" />
          <div className="min-w-0">
            <p className="font-display font-bold text-ink">{avisKyc.titre}</p>
            <p className="mt-1 text-sm leading-6 text-ink">{avisKyc.message}</p>
            <Link
              href="/admin/verification"
              className="mt-3 inline-block rounded-md bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-slate-deep-line"
            >
              Ouvrir la vérification
            </Link>
          </div>
        </div>
      )}

      <section className="rounded-xl border border-line bg-paper p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
              Portefeuille FCFA
            </h2>
            <p
              className={`mt-1 font-display text-3xl font-bold tabular-nums ${
                walletBalanceCents < 0 ? "text-err" : "text-ink"
              }`}
            >
              {formatFcfa(walletBalanceCents)}
            </p>
            <p className="mt-1 text-sm text-ink-soft">
              Paie les accès VPN directs (WinBox/WebFig/SSH/MikHmon) et les Auto-Setup.
            </p>
          </div>
          <WalletTopupModal
            defaultCountry={currentUser?.country ?? "CI"}
            geniusPayEnabled={isGeniusPayCheckoutEnabled()}
            trigger={<span className={BOUTON_SOLDE}>+ Ajouter des fonds</span>}
          />
        </div>

        {walletBalanceCents < 0 && (
          <p className="mt-3 rounded-lg border border-err bg-err-soft px-3 py-2 text-sm text-ink">
            Solde négatif : les prochains débits VPN ou Auto-Setup seront refusés tant qu&apos;il
            n&apos;est pas repassé au-dessus de zéro.
          </p>
        )}

        {topup === "success" && transaction ? (
          <div className="mt-4">
            <WalletTopupReturn transactionId={transaction} />
          </div>
        ) : null}

        {/* Pack revendeur — n'apparaît qu'aux comptes qui l'ont demandé et pas
            encore réglé, ou dont le pack a expiré. Un compte simple ne le voit
            pas : le statut se demande à l'inscription. */}
        {reseller && (reseller.pendingPayment || reseller.expired) && (
          <div className="mt-5 rounded-xl border border-brand-deep bg-brand/15 p-4 sm:p-5">
            <p className="text-sm font-semibold text-ink">
              {reseller.expired ? "Votre pack revendeur a expiré" : "Pack revendeur — à régler"}
            </p>
            <p className="mt-1 text-xs leading-5 text-ink-soft">
              {`${new Intl.NumberFormat("fr-FR").format(RESELLER_PACK_FCFA)} FCFA par an : ${RESELLER_QUOTA} installations à ${new Intl.NumberFormat("fr-FR").format(RESELLER_SETUP_FEE_CENTS)} FCFA au lieu de ${new Intl.NumberFormat("fr-FR").format(10000)} FCFA. Le montant revient intégralement en crédit sur ce portefeuille.`}
            </p>
            <div className="mt-4">
              <WalletTopupModal
                purpose="reseller_pack"
                defaultCountry={currentUser?.country ?? "CI"}
                geniusPayEnabled={isGeniusPayCheckoutEnabled()}
                trigger={
                  <span className={BOUTON_SOLDE}>
                    {reseller.expired ? "Renouveler le pack" : "Régler le pack"}
                  </span>
                }
              />
            </div>
          </div>
        )}

        {reseller?.active && (
          <p className="mt-4 rounded-lg border border-line bg-clay px-4 py-3 text-xs text-ink-soft">
            {`Compte revendeur actif — ${reseller.quotaLeft} installation${reseller.quotaLeft > 1 ? "s" : ""} remisée${reseller.quotaLeft > 1 ? "s" : ""} sur ${reseller.quotaTotal}.`}
          </p>
        )}

        <h3 className="mt-6 border-t border-line-soft pt-4 text-xs font-semibold uppercase tracking-wide text-ink-soft">
          Mouvements
        </h3>
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
      </section>

      {safecoinTopup === "success" && transaction ? (
        <SafecoinTopupReturn transactionId={transaction} />
      ) : null}
      <SafecoinWalletCard
        balanceScCents={safecoinAccount[0]?.balanceScCents ?? 0}
        rateFcfaPerSc={rateFcfaPerSc}
        entries={safecoinEntries}
        defaultCountry={currentUser?.country ?? "CI"}
        geniusPayEnabled={isGeniusPayCheckoutEnabled()}
      />

      <PricingTable rateFcfaPerSc={rateFcfaPerSc} />

      {referral && (
        <ReferralCard
          code={referral.code}
          shareUrl={`${getAppUrl()}/auth/register?ref=${referral.code}`}
          totalScCents={referral.totalScCents}
          referredCount={referral.referredCount}
          rewards={referral.rewards.map((r) => ({
            id: r.id,
            event: r.event,
            amountScCents: r.amountScCents,
            referredName: r.referredName,
            dateLabel: formatDate(r.createdAt),
          }))}
          referred={referral.referred.map((r) => ({
            id: r.id,
            name: r.name,
            contact: r.contact,
            dateLabel: formatDate(r.joinedAt),
          }))}
        />
      )}

      {/* Identité du compte — à donner au support, jamais à décider. */}
      <footer className="border-t border-line-soft pt-4 text-xs leading-6 text-ink-soft">
        <p>
          <span className="font-semibold text-ink">{org?.name ?? "—"}</span>
          {" · "}identifiant <code className="font-mono">{org?.slug ?? "—"}</code>
          {" · "}
          {teamCount} membre{teamCount > 1 ? "s" : ""}
          {org ? ` · client depuis le ${formatDate(org.createdAt)}` : ""}
        </p>
        <p className="mt-1">
          Les dépôts en ligne sont confirmés automatiquement par la passerelle. Les demandes
          manuelles restent dans le journal, pour le suivi avec le support SafeLinkHub.
        </p>
      </footer>
    </div>
  );
}
