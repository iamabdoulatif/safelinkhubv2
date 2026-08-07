"use client";

// TEMPORAIRE — modal de monétisation manuelle de l'Auto-Setup. S'affiche
// quand un utilisateur non superadmin (et non encore autorisé) tente de
// lancer l'auto-setup. Met en avant le paiement GeniusPay (déblocage
// AUTOMATIQUE au webhook) comme action unique et rapide ; le paiement manuel
// (preuve + validation admin) est replié en secondaire.
// TODO: Remplacer par système de paiement intégré.

import { useEffect, useState, useTransition } from "react";
import {
  Lock,
  Loader2,
  CheckCircle2,
  ExternalLink,
  CreditCard,
  ShieldCheck,
  ChevronDown,
  Wallet,
  X,
} from "lucide-react";
import {
  PAYMENT_METHODS,
  type PaymentMethodId,
  autoSetupPriceFcfa,
  formatFcfa,
  mikrotikKindLabel,
} from "@/lib/billing/auto-setup-gate-config";
import {
  submitAutoSetupAuthorizationRequest,
  getAutoSetupGateConfigPublic,
  startAutoSetupPayment,
  getAutoSetupBalancesPublic,
  payAutoSetupFromBalance,
} from "@/lib/billing/auto-setup-authorization-actions";

type PublicConfig = {
  priceWithContainerFcfa: number;
  priceWithoutContainerFcfa: number;
  whatsappNumber: string;
  geniusPayEnabled: boolean;
};

export default function AutoSetupPaywallModal({
  open,
  onClose,
  routerId,
  supportsContainers,
  latestStatus,
  onSubmitted,
}: {
  open: boolean;
  onClose: () => void;
  routerId: string;
  supportsContainers: boolean;
  /** Statut de la dernière demande pour ce routeur (pending/rejected/…). */
  latestStatus: string | null;
  onSubmitted: () => void;
}) {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [method, setMethod] = useState<PaymentMethodId>("wave");
  const [amount, setAmount] = useState<string>("");
  const [proof, setProof] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ whatsappUrl: string; emailSent: boolean } | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  // Soldes de l'org pour le paiement « depuis le solde » (portefeuille / Safecoins).
  const [balances, setBalances] = useState<{ walletFcfa: number; safecoinFcfa: number } | null>(null);
  const [balanceDone, setBalanceDone] = useState<"wallet" | "safecoin" | null>(null);

  useEffect(() => {
    if (!open) return;
    getAutoSetupGateConfigPublic().then((c) => {
      setConfig(c);
      setAmount(String(autoSetupPriceFcfa(c, supportsContainers)));
    });
  }, [open, supportsContainers]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getAutoSetupBalancesPublic().then((b) => {
      if (!cancelled) setBalances({ walletFcfa: b.walletFcfa, safecoinFcfa: b.safecoinFcfa });
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Fermeture au clavier (Échap) — attendu d'un dialogue.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const applicable = config ? autoSetupPriceFcfa(config, supportsContainers) : null;
  const priceLabel = applicable !== null ? formatFcfa(applicable) : null;
  const geniusOn = !!config?.geniusPayEnabled;
  // Sans GeniusPay, le paiement manuel EST le parcours principal : toujours ouvert.
  const manualExpanded = manualOpen || (!!config && !geniusOn);
  // Estimation d'affichage : le coût Safecoin réel inclut les frais de service,
  // donc le serveur revérifie le solde avant de débiter.
  const canPayFromBalance = Boolean(
    balances &&
      applicable !== null &&
      (balances.walletFcfa >= applicable || balances.safecoinFcfa >= applicable),
  );

  function submit() {
    setError(null);
    const amountFcfa = Number(amount);
    if (!Number.isInteger(amountFcfa) || amountFcfa <= 0) {
      setError("Indiquez le montant payé (FCFA).");
      return;
    }
    const fd = new FormData();
    fd.set("routerId", routerId);
    fd.set("supportsContainers", supportsContainers ? "1" : "0");
    fd.set("amountFcfa", String(amountFcfa));
    fd.set("paymentMethod", method);
    if (proof) fd.set("proof", proof);

    startTransition(async () => {
      const res = await submitAutoSetupAuthorizationRequest(fd);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setDone({ whatsappUrl: res.whatsappUrl, emailSent: res.emailSent });
      // Ouvre WhatsApp pré-rempli pour envoyer la preuve à l'admin.
      window.open(res.whatsappUrl, "_blank", "noopener,noreferrer");
      onSubmitted();
    });
  }

  // Paiement en ligne : ouvre le checkout GeniusPay. Tarif imposé côté serveur ;
  // l'auto-setup se débloque dès le webhook payment.success.
  function payOnline() {
    setError(null);
    const fd = new FormData();
    fd.set("routerId", routerId);
    fd.set("supportsContainers", supportsContainers ? "1" : "0");
    startTransition(async () => {
      const res = await startAutoSetupPayment(fd);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      window.location.href = res.paymentUrl;
    });
  }

  // Paiement depuis le solde : débite le portefeuille FCFA en priorité, sinon
  // les Safecoins, et autorise l'auto-setup immédiatement (pas de checkout
  // externe, pas de validation admin).
  function payWithBalance() {
    setError(null);
    const fd = new FormData();
    fd.set("routerId", routerId);
    fd.set("supportsContainers", supportsContainers ? "1" : "0");
    startTransition(async () => {
      const res = await payAutoSetupFromBalance(fd);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setBalanceDone(res.source);
      onSubmitted();
    });
  }

  return (
    // Ancré EN HAUT (items-start) et non centré : quand le contenu change de
    // hauteur (chargement du prix, ouverture du paiement manuel, écran de
    // succès), la boîte grandit vers le bas sans se re-centrer — plus de saut
    // vertical. Le fond défile si le contenu dépasse (pas de scroll imbriqué).
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-[7vh]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="paywall-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-paper p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <Lock className="h-4.5 w-4.5 text-brand-deep" aria-hidden="true" />
          <h2 id="paywall-title" className="text-sm font-semibold text-ink">
            Débloquer l&apos;auto-setup
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="ml-auto -mr-1 rounded-md p-1 text-ink-soft hover:bg-clay"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        {done ? (
          <div className="mt-5">
            <div className="flex items-start gap-2 rounded-lg bg-green-50 p-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" aria-hidden="true" />
              <div className="text-sm text-green-800">
                <p className="font-medium">Demande envoyée</p>
                <p className="mt-1">
                  Elle est en attente de validation par l&apos;administrateur. Envoyez votre preuve
                  de paiement via WhatsApp si la fenêtre ne s&apos;est pas ouverte.
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
          <div className="mt-5">
            <div className="flex items-start gap-2 rounded-lg bg-green-50 p-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" aria-hidden="true" />
              <div className="text-sm text-green-800">
                <p className="font-medium">Configuration débloquée !</p>
                <p className="mt-1">
                  Payé avec{" "}
                  {balanceDone === "wallet" ? "votre portefeuille (FCFA)" : "vos Safecoins"}. Fermez
                  cette fenêtre et relancez l&apos;auto-setup.
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
            {latestStatus === "pending" && (
              <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Une demande est déjà <strong>en attente de validation</strong> pour ce routeur.
              </p>
            )}
            {latestStatus === "rejected" && (
              <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                Votre dernière demande a été <strong>refusée</strong>. Vérifiez le paiement puis
                réessayez.
              </p>
            )}

            {/* Montant unique, mis en avant — seul le tarif du routeur détecté. */}
            <div className="mt-5 text-center">
              <p className="text-xs text-ink-soft">
                Routeur détecté {mikrotikKindLabel(supportsContainers).toLowerCase()} · paiement unique
              </p>
              {priceLabel ? (
                <p className="mt-1 text-3xl font-bold tracking-tight text-ink">{priceLabel}</p>
              ) : (
                <div className="mx-auto mt-2 h-8 w-32 animate-pulse rounded-md bg-clay" aria-hidden="true" />
              )}
            </div>

            {geniusOn && (
              <>
                <button
                  type="button"
                  onClick={payOnline}
                  disabled={pending || applicable === null}
                  autoFocus
                  className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-deep px-4 py-3 text-[15px] font-semibold text-white hover:opacity-90 disabled:opacity-60"
                >
                  {pending ? (
                    <Loader2 className="h-4.5 w-4.5 animate-spin" />
                  ) : (
                    <CreditCard className="h-4.5 w-4.5" />
                  )}
                  Payer {priceLabel ?? ""}
                </button>

                <div className="mt-2.5 flex flex-wrap items-center justify-center gap-1.5">
                  <span className="text-[11px] text-ink-soft">via GeniusPay ·</span>
                  {PAYMENT_METHODS.map((m) => (
                    <span
                      key={m.id}
                      className="rounded-full bg-clay px-2 py-0.5 text-[11px] font-medium text-ink"
                    >
                      {m.label}
                    </span>
                  ))}
                </div>

                <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-green-700">
                  <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Paiement sécurisé · l&apos;auto-setup se débloque automatiquement dès confirmation.
                </p>
              </>
            )}

            {/* Paiement depuis le solde — même offre que l'accès distant :
                portefeuille FCFA en priorité, sinon Safecoins. */}
            {balances && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={payWithBalance}
                  disabled={pending || !canPayFromBalance || applicable === null}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border-2 border-brand-deep bg-brand/10 px-4 py-2.5 text-sm font-semibold text-brand-deep hover:bg-brand/20 disabled:opacity-50"
                >
                  {pending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Wallet className="h-4 w-4" />
                  )}
                  Payer avec mon solde {priceLabel ?? ""}
                </button>
                <p className="mt-1.5 text-[11px] text-ink-soft">
                  Portefeuille : {formatFcfa(balances.walletFcfa)} · Safecoins : ≈{" "}
                  {formatFcfa(balances.safecoinFcfa)}.{" "}
                  {canPayFromBalance
                    ? "Débité immédiatement (portefeuille en priorité), l’auto-setup se débloque aussitôt."
                    : "Solde insuffisant — rechargez, ou payez en ligne / manuellement."}
                </p>
              </div>
            )}

            {/* Paiement manuel : replié en secondaire quand GeniusPay est actif ;
                parcours principal (déplié) quand il ne l'est pas. */}
            <div className="mt-5 border-t border-line-soft pt-4">
              {geniusOn ? (
                <button
                  type="button"
                  onClick={() => setManualOpen((v) => !v)}
                  aria-expanded={manualExpanded}
                  aria-controls="manual-payment"
                  className="flex w-full items-center justify-center gap-1.5 text-sm text-ink-soft hover:text-ink"
                >
                  J&apos;ai payé autrement (preuve manuelle)
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${manualExpanded ? "rotate-180" : ""}`}
                  />
                </button>
              ) : (
                <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">
                  Paiement manuel
                </p>
              )}

              {manualExpanded && (
                <div id="manual-payment" className="mt-4 space-y-3">
                  {!geniusOn && (
                    <p className="text-sm text-ink-soft">
                      Effectuez le paiement par mobile money, puis soumettez votre preuve : un
                      administrateur validera l&apos;accès.
                    </p>
                  )}
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
                    <span className="text-xs font-medium text-ink-soft">Montant payé (FCFA)</span>
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
                  <button
                    onClick={submit}
                    disabled={pending || !config}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-line-soft bg-paper px-4 py-2 text-sm font-medium text-ink hover:bg-clay disabled:opacity-60"
                  >
                    {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                    J&apos;ai payé — envoyer la demande
                  </button>
                </div>
              )}
            </div>

            {error && (
              <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
