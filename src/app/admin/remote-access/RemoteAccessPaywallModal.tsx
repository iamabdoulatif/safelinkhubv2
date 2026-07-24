"use client";

// TEMPORAIRE — modal de monétisation manuelle d'un accès distant
// (WinBox/WebFig/SSH/MikHmon). S'affiche quand un utilisateur non superadmin
// (non autorisé) tente d'activer un service. Tarif par durée, moyens de
// paiement, soumission d'une demande (email admin + WhatsApp).
// TODO: Remplacer par système de paiement intégré.

import { useEffect, useState, useTransition } from "react";
import { Lock, Loader2, CheckCircle2, ExternalLink, CreditCard, Wallet } from "lucide-react";
import type { BillingPeriod } from "@/lib/mikrotik/billing-plans";
import {
  PAYMENT_METHODS,
  type PaymentMethodId,
  formatFcfa,
} from "@/lib/billing/auto-setup-gate-config";
import {
  BILLING_PERIODS,
  remoteAccessPriceFcfa,
  serviceLabel,
} from "@/lib/billing/remote-access-gate-config";
import {
  submitRemoteAccessAuthorizationRequest,
  startRemoteAccessPayment,
  getRemoteAccessPaymentConfigPublic,
  getRemoteAccessBalancesPublic,
  payRemoteAccessFromBalance,
} from "@/lib/billing/remote-access-authorization-actions";

export default function RemoteAccessPaywallModal({
  open,
  onClose,
  routerId,
  service,
  initialPeriod,
  latestStatus,
  onSubmitted,
}: {
  open: boolean;
  onClose: () => void;
  routerId: string;
  service: string;
  initialPeriod: BillingPeriod;
  latestStatus: string | null;
  onSubmitted: () => void;
}) {
  // Le modal est monté à neuf à chaque ouverture ({paywall && …}), donc
  // initialiser l'état depuis les props suffit — pas d'effet de reset (qui
  // déclencherait des rendus en cascade, cf. règle react-hooks).
  const [period, setPeriod] = useState<BillingPeriod>(initialPeriod);
  const [method, setMethod] = useState<PaymentMethodId>("wave");
  const [amount, setAmount] = useState<string>(() => String(remoteAccessPriceFcfa(initialPeriod)));
  const [proof, setProof] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ whatsappUrl: string; emailSent: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  // Paiement en ligne GeniusPay : disponible seulement si les clés plateforme
  // sont configurées côté serveur. Récupéré à l'ouverture ; tant qu'inconnu, on
  // n'affiche pas le bouton en ligne (le flux manuel reste toujours possible).
  const [onlineEnabled, setOnlineEnabled] = useState(false);
  // Soldes de l'org pour le paiement « depuis le solde » (portefeuille / Safecoins).
  const [balances, setBalances] = useState<{ walletFcfa: number; safecoinFcfa: number } | null>(null);
  const [balanceDone, setBalanceDone] = useState<"wallet" | "safecoin" | null>(null);

  useEffect(() => {
    let cancelled = false;
    getRemoteAccessPaymentConfigPublic()
      .then((c) => {
        if (!cancelled) setOnlineEnabled(c.geniusPayEnabled);
      })
      .catch(() => {});
    getRemoteAccessBalancesPublic()
      .then((b) => {
        if (!cancelled) setBalances({ walletFcfa: b.walletFcfa, safecoinFcfa: b.safecoinFcfa });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!open) return null;

  const price = remoteAccessPriceFcfa(period);

  // Change la durée et aligne le montant proposé sur son tarif.
  function selectPeriod(p: BillingPeriod) {
    setPeriod(p);
    setAmount(String(remoteAccessPriceFcfa(p)));
  }

  function submit() {
    setError(null);
    const amountFcfa = Number(amount);
    if (!Number.isInteger(amountFcfa) || amountFcfa <= 0) {
      setError("Indiquez le montant payé (FCFA).");
      return;
    }
    const fd = new FormData();
    fd.set("routerId", routerId);
    fd.set("service", service);
    fd.set("billingPeriod", period);
    fd.set("amountFcfa", String(amountFcfa));
    fd.set("paymentMethod", method);
    if (proof) fd.set("proof", proof);

    startTransition(async () => {
      const res = await submitRemoteAccessAuthorizationRequest(fd);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setDone({ whatsappUrl: res.whatsappUrl, emailSent: res.emailSent });
      window.open(res.whatsappUrl, "_blank", "noopener,noreferrer");
      onSubmitted();
    });
  }

  // Paiement en ligne : ouvre le checkout GeniusPay. Le tarif est imposé côté
  // serveur (on n'envoie pas de montant), et l'accès s'ouvre automatiquement
  // dès réception du webhook payment.success.
  function payOnline() {
    setError(null);
    const fd = new FormData();
    fd.set("routerId", routerId);
    fd.set("service", service);
    fd.set("billingPeriod", period);
    startTransition(async () => {
      const res = await startRemoteAccessPayment(fd);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      window.location.href = res.paymentUrl;
    });
  }

  // Paiement DEPUIS LE SOLDE : débite le portefeuille (FCFA) en priorité, sinon
  // les Safecoins, et approuve l'accès immédiatement (pas de checkout externe).
  const canPayFromBalance = Boolean(balances && (balances.walletFcfa >= price || balances.safecoinFcfa >= price));
  function payWithBalance() {
    setError(null);
    const fd = new FormData();
    fd.set("routerId", routerId);
    fd.set("service", service);
    fd.set("billingPeriod", period);
    startTransition(async () => {
      const res = await payRemoteAccessFromBalance(fd);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setBalanceDone(res.source);
      onSubmitted();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-paper p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <Lock className="h-5 w-5 text-brand-deep" />
          <h2 className="text-lg font-bold text-ink">
            Accès distant payant — {serviceLabel(service)}
          </h2>
        </div>

        {done ? (
          <div className="mt-4">
            <div className="flex items-start gap-2 rounded-md bg-green-50 p-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
              <div className="text-sm text-green-800">
                <p className="font-medium">Demande envoyée !</p>
                <p className="mt-1">
                  En attente de validation par l&apos;administrateur. Envoyez votre preuve via
                  WhatsApp si la fenêtre ne s&apos;est pas ouverte.
                  {done.emailSent ? " Un email a aussi été envoyé à l'admin." : ""}
                </p>
                <a
                  href={done.whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-brand-deep px-3 py-1.5 text-xs font-medium text-white"
                >
                  Ouvrir WhatsApp <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={onClose}
                className="rounded-md border border-line-soft px-4 py-2 text-sm font-medium text-ink-soft hover:bg-clay"
              >
                Fermer
              </button>
            </div>
          </div>
        ) : balanceDone ? (
          <div className="mt-4">
            <div className="flex items-start gap-2 rounded-md bg-green-50 p-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
              <div className="text-sm text-green-800">
                <p className="font-medium">Accès autorisé !</p>
                <p className="mt-1">
                  Payé avec {balanceDone === "wallet" ? "votre portefeuille (FCFA)" : "vos Safecoins"}.
                  Fermez cette fenêtre et réessayez d&apos;ouvrir le service.
                </p>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={onClose}
                className="rounded-md bg-brand-deep px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Fermer
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="mt-2 text-sm text-ink-soft">
              L&apos;activation de cet accès distant est payante. Choisissez une durée, effectuez le
              paiement, puis soumettez votre preuve : un administrateur validera l&apos;accès.
            </p>

            {latestStatus === "pending" && (
              <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Une demande est déjà <strong>en attente</strong> pour ce service.
              </p>
            )}
            {latestStatus === "rejected" && (
              <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                Votre dernière demande a été <strong>refusée</strong>. Renvoyez-en une après
                vérification du paiement.
              </p>
            )}

            {/* Durées et tarifs */}
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {BILLING_PERIODS.map((p) => {
                const active = p.id === period;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => selectPeriod(p.id)}
                    className={`rounded-lg border p-2 text-center ${
                      active ? "border-brand-deep bg-brand/10" : "border-line-soft bg-clay/40"
                    }`}
                  >
                    <p className="text-xs text-ink-soft">{p.label}</p>
                    <p className="mt-0.5 text-sm font-bold text-ink">
                      {formatFcfa(remoteAccessPriceFcfa(p.id))}
                    </p>
                  </button>
                );
              })}
            </div>

            {onlineEnabled && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={payOnline}
                  disabled={pending}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-brand-deep px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
                >
                  {pending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CreditCard className="h-4 w-4" />
                  )}
                  Payer en ligne {formatFcfa(price)} (GeniusPay)
                </button>
                <p className="mt-1.5 text-[11px] text-ink-soft">
                  Paiement Wave / Orange / MTN / Moov ou carte. L&apos;accès s&apos;ouvre
                  automatiquement dès le paiement confirmé.
                </p>
              </div>
            )}

            {balances && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={payWithBalance}
                  disabled={pending || !canPayFromBalance}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md border-2 border-brand-deep bg-brand/10 px-4 py-2.5 text-sm font-semibold text-brand-deep hover:bg-brand/20 disabled:opacity-50"
                >
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                  Payer avec mon solde {formatFcfa(price)}
                </button>
                <p className="mt-1.5 text-[11px] text-ink-soft">
                  Portefeuille : {formatFcfa(balances.walletFcfa)} · Safecoins : ≈{" "}
                  {formatFcfa(balances.safecoinFcfa)}.{" "}
                  {canPayFromBalance
                    ? "Débité immédiatement (portefeuille en priorité), l’accès s’ouvre aussitôt."
                    : "Solde insuffisant — rechargez, ou payez en ligne / manuellement."}
                </p>
              </div>
            )}

            {(onlineEnabled || balances) && (
              <div className="mt-4 flex items-center gap-2 text-[11px] uppercase tracking-wide text-ink-soft">
                <span className="h-px flex-1 bg-line-soft" /> ou paiement manuel{" "}
                <span className="h-px flex-1 bg-line-soft" />
              </div>
            )}

            <div className="mt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">
                Moyens de paiement acceptés
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {PAYMENT_METHODS.map((m) => (
                  <span
                    key={m.id}
                    className="rounded-full bg-clay px-2.5 py-1 text-xs font-medium text-ink"
                  >
                    {m.label}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-4 space-y-3 border-t border-line-soft pt-4">
              <label className="block">
                <span className="text-xs font-medium text-ink-soft">Moyen utilisé</span>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value as PaymentMethodId)}
                  className="mt-1 w-full rounded-md border border-line-soft px-3 py-2 text-sm focus:outline-none"
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-ink-soft">
                  Montant payé (FCFA) — tarif {formatFcfa(price)}
                </span>
                <input
                  type="number"
                  min={1}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="mt-1 w-full rounded-md border border-line-soft px-3 py-2 text-sm focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-ink-soft">
                  Preuve de paiement (capture — optionnel, à joindre aussi via WhatsApp)
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setProof(e.target.files?.[0] ?? null)}
                  className="mt-1 w-full text-sm text-ink-soft file:mr-3 file:rounded-md file:border-0 file:bg-clay file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-ink"
                />
              </label>
            </div>

            {error && (
              <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={onClose}
                className="rounded-md border border-line-soft px-4 py-2 text-sm font-medium text-ink-soft hover:bg-clay"
              >
                Annuler
              </button>
              <button
                onClick={submit}
                disabled={pending}
                className="inline-flex items-center gap-2 rounded-md bg-brand-deep px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
              >
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                J&apos;ai payé — envoyer la demande
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
