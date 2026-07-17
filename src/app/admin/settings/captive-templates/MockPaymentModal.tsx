"use client";

import { useState } from "react";
import { Check, Loader2, Smartphone, X } from "lucide-react";

const LABELS: Record<string, string> = {
  genius_pay: "Genius Pay",
  paystack: "Paystack",
};

const IS_CARD_PROVIDER: Record<string, boolean> = {
  genius_pay: true,
  paystack: true,
};

type Step = "phone" | "pending" | "done";

export default function MockPaymentModal({
  provider,
  onClose,
}: {
  provider: string;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const isCard = IS_CARD_PROVIDER[provider] ?? false;

  function submitPhone(e: React.FormEvent) {
    e.preventDefault();
    setStep("pending");
    setTimeout(() => setStep("done"), 1800);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90dvh] overflow-y-auto w-full max-w-sm rounded-xl bg-paper p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">
            Payer avec {LABELS[provider] ?? provider}
          </h3>
          <button type="button" onClick={onClose}>
            <X className="h-5 w-5 text-ink-soft" />
          </button>
        </div>

        <p className="mt-1 rounded-md bg-clay px-2.5 py-1.5 text-[11px] text-warn">
          Maquette — aucun débit réel n&apos;est effectué.
        </p>

        {step === "phone" && (
          <form onSubmit={submitPhone} className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">
                {isCard
                  ? `Email pour le reçu ${LABELS[provider] ?? provider}`
                  : `Numéro ${LABELS[provider] ?? provider}`}
              </label>
              <input
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={isCard ? "client@email.com" : "07 00 00 00 00"}
                className="w-full rounded-md border border-line-soft px-3 py-2 text-sm focus:border-line-soft focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-md bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-[#3A362F]"
            >
              {isCard ? "Continuer vers le paiement" : "Envoyer la demande de paiement"}
            </button>
          </form>
        )}

        {step === "pending" && (
          <div className="mt-6 flex flex-col items-center gap-3 py-4 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-ink-soft" />
            <p className="text-sm text-ink-soft">
              {isCard
                ? `Redirection vers la page de paiement sécurisée ${LABELS[provider] ?? provider}...`
                : `Confirmez le paiement sur votre téléphone (${phone})...`}
            </p>
            {!isCard && <Smartphone className="h-5 w-5 text-clay" />}
          </div>
        )}

        {step === "done" && (
          <div className="mt-6 flex flex-col items-center gap-3 py-4 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-clay text-ok">
              <Check className="h-5 w-5" />
            </span>
            <p className="text-sm font-medium text-ink">
              Paiement simulé reçu
            </p>
            <p className="text-xs text-ink-soft">
              Dans la version finale, un voucher serait généré et connecté
              automatiquement ici.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 rounded-md border border-line-soft px-4 py-2 text-sm font-medium text-ink-soft hover:bg-clay"
            >
              Fermer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
