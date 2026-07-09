"use client";

// TEMPORAIRE — modal de monétisation manuelle de l'Auto-Setup. S'affiche
// quand un utilisateur non superadmin (et non encore autorisé) tente de
// lancer l'auto-setup. Explique la tarification, liste les moyens de
// paiement, et soumet une demande d'autorisation (email admin + WhatsApp).
// TODO: Remplacer par système de paiement intégré.

import { useEffect, useState, useTransition } from "react";
import { Lock, Loader2, CheckCircle2, ExternalLink, CreditCard } from "lucide-react";
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
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    getAutoSetupGateConfigPublic().then((c) => {
      setConfig(c);
      setAmount(String(autoSetupPriceFcfa(c, supportsContainers)));
    });
  }, [open, supportsContainers]);

  if (!open) return null;

  const applicable = config ? autoSetupPriceFcfa(config, supportsContainers) : null;

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
          <h2 className="text-lg font-bold text-ink">Auto-Setup — fonctionnalité payante</h2>
        </div>

        {done ? (
          <div className="mt-4">
            <div className="flex items-start gap-2 rounded-md bg-green-50 p-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
              <div className="text-sm text-green-800">
                <p className="font-medium">Demande envoyée !</p>
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
        ) : (
          <>
            <p className="mt-2 text-sm text-ink-soft">
              La configuration automatique du routeur est une fonctionnalité payante. Effectuez le
              paiement, puis soumettez votre preuve : un administrateur validera l&apos;accès.
            </p>

            {latestStatus === "pending" && (
              <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Une demande est déjà <strong>en attente de validation</strong> pour ce routeur. Vous
                pouvez en renvoyer une si besoin.
              </p>
            )}
            {latestStatus === "rejected" && (
              <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                Votre dernière demande a été <strong>refusée</strong>. Vérifiez le paiement puis
                renvoyez une demande.
              </p>
            )}

            {/* Tarifs — le tarif applicable au routeur détecté est mis en avant. */}
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <PriceCard
                label="Sans container (ex : RB951)"
                price={config ? formatFcfa(config.priceWithoutContainerFcfa) : "…"}
                active={!supportsContainers}
              />
              <PriceCard
                label="Avec container"
                price={config ? formatFcfa(config.priceWithContainerFcfa) : "…"}
                active={supportsContainers}
              />
            </div>
            <p className="mt-2 text-xs text-ink-soft">
              Ce routeur est détecté <strong>{mikrotikKindLabel(supportsContainers).toLowerCase()}</strong>
              {applicable !== null ? ` → ${formatFcfa(applicable)}.` : "."}
            </p>

            {config?.geniusPayEnabled && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={payOnline}
                  disabled={pending || applicable === null}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-brand-deep px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
                >
                  {pending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CreditCard className="h-4 w-4" />
                  )}
                  Payer en ligne {applicable !== null ? formatFcfa(applicable) : ""} (GeniusPay)
                </button>
                <p className="mt-1.5 text-[11px] text-ink-soft">
                  Paiement Wave / Orange / MTN / Moov ou carte. L&apos;auto-setup se débloque
                  automatiquement dès le paiement confirmé.
                </p>
                <div className="mt-4 flex items-center gap-2 text-[11px] uppercase tracking-wide text-ink-soft">
                  <span className="h-px flex-1 bg-line-soft" /> ou paiement manuel{" "}
                  <span className="h-px flex-1 bg-line-soft" />
                </div>
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

            {/* Formulaire de demande */}
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
                disabled={pending || !config}
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

function PriceCard({ label, price, active }: { label: string; price: string; active: boolean }) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        active ? "border-brand-deep bg-brand/10" : "border-line-soft bg-clay/40"
      }`}
    >
      <p className="text-xs text-ink-soft">{label}</p>
      <p className="mt-0.5 text-base font-bold text-ink">{price}</p>
    </div>
  );
}
