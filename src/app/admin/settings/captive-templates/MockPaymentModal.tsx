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
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">
            Payer avec {LABELS[provider] ?? provider}
          </h3>
          <button type="button" onClick={onClose}>
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        <p className="mt-1 rounded-md bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-700">
          Maquette — aucun débit réel n&apos;est effectué.
        </p>

        {step === "phone" && (
          <form onSubmit={submitPhone} className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                {isCard
                  ? `Email pour le reçu ${LABELS[provider] ?? provider}`
                  : `Numéro ${LABELS[provider] ?? provider}`}
              </label>
              <input
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={isCard ? "client@email.com" : "07 00 00 00 00"}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              {isCard ? "Continuer vers le paiement" : "Envoyer la demande de paiement"}
            </button>
          </form>
        )}

        {step === "pending" && (
          <div className="mt-6 flex flex-col items-center gap-3 py-4 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            <p className="text-sm text-slate-600">
              {isCard
                ? `Redirection vers la page de paiement sécurisée ${LABELS[provider] ?? provider}...`
                : `Confirmez le paiement sur votre téléphone (${phone})...`}
            </p>
            {!isCard && <Smartphone className="h-5 w-5 text-slate-300" />}
          </div>
        )}

        {step === "done" && (
          <div className="mt-6 flex flex-col items-center gap-3 py-4 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <Check className="h-5 w-5" />
            </span>
            <p className="text-sm font-medium text-slate-900">
              Paiement simulé reçu
            </p>
            <p className="text-xs text-slate-500">
              Dans la version finale, un voucher serait généré et connecté
              automatiquement ici.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Fermer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
