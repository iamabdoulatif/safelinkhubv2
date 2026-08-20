"use client";

import { useActionState, useState } from "react";
import Image from "next/image";
import { Check } from "lucide-react";
import { savePaymentGateway } from "@/lib/payment-gateways/actions";
import type { Provider } from "@/lib/payment-gateways/providers";

// Paystack/Genius Pay/PawaPay logos are full wordmarks (icon + brand name
// baked in, or a pure text logo for PawaPay) — shown alone, no separate
// label needed.
const LOGOS: Record<Provider, { src: string; width: number; height: number; standalone: boolean }> = {
  paystack: { src: "/Paystack.png", width: 1354, height: 626, standalone: true },
  genius_pay: { src: "/geniuspay.svg", width: 712, height: 205, standalone: true },
  pawapay: { src: "/pawapay.svg", width: 714, height: 153, standalone: true },
};

const LABELS: Record<Provider, string> = {
  genius_pay: "Genius Pay",
  paystack: "Paystack",
  pawapay: "PawaPay",
};

const ACCENTS: Record<Provider, string> = {
  genius_pay: "hover:ring-line-soft",
  paystack: "hover:ring-line-soft",
  pawapay: "hover:ring-line-soft",
};

const SUBTITLES: Record<Provider, string> = {
  paystack: "Couvre Wave, Orange Money, Moov Money, MTN MoMo et carte bancaire en interne.",
  genius_pay: "Couvre Wave, Orange Money, Moov Money, MTN MoMo et carte bancaire en interne.",
  pawapay: "Couvre Wave, Orange Money, Moov Money, MTN MoMo et carte bancaire en interne.",
};

// Each aggregator issues a different credential pair, so the two form fields
// are labelled per-provider. Genius Pay authenticates every API call with TWO
// keys sent as headers — X-API-Key (publishable, pk_live_…) and X-API-Secret
// (secret, sk_live_…) — and has no "merchant id" (see pay.genius.ci/doc), so
// its keys live at Paramètres → API on pay.genius.ci, not on the Transactions
// page. The first field maps to the plaintext `merchantId` column (fine for the
// publishable X-API-Key) and the second to the encrypted `apiKey` column (the
// X-API-Secret, which must stay server-side). Paystack/PawaPay keep the generic
// wording until their real credential models are wired.
type FieldCopy = {
  idLabel: string;
  idPlaceholder: string;
  idHint?: string;
  keyLabel: string;
  keyPlaceholder: string;
  keyHint: string;
};

const GENERIC_FIELDS: FieldCopy = {
  idLabel: "Identifiant marchand",
  idPlaceholder: "ID marchand",
  keyLabel: "Clé API",
  keyPlaceholder: "Clé API",
  keyHint: "Laissez vide pour conserver la clé actuelle.",
};

const FIELDS: Record<Provider, FieldCopy> = {
  paystack: GENERIC_FIELDS,
  pawapay: GENERIC_FIELDS,
  genius_pay: {
    idLabel: "API Key",
    idPlaceholder: "pk_live_…",
    idHint: "La clé « API Key » de pay.genius.ci → Paramètres → API (envoyée en en-tête X-API-Key).",
    keyLabel: "API Secret",
    keyPlaceholder: "sk_live_…",
    keyHint:
      "La clé « API Secret » de pay.genius.ci (en-tête X-API-Secret). Gardée chiffrée côté serveur — laissez vide pour conserver la clé actuelle.",
  },
};

export default function GatewayCard({
  provider,
  merchantId,
  enabled,
  hasApiKey,
}: {
  provider: Provider;
  merchantId: string | null;
  enabled: boolean;
  hasApiKey: boolean;
}) {
  const [state, formAction, pending] = useActionState(savePaymentGateway, undefined);
  const [isEnabled, setIsEnabled] = useState(enabled);
  const logo = LOGOS[provider];
  const fields = FIELDS[provider];

  return (
    <form
      action={formAction}
      className={`border border-line bg-paper p-5 ring-1 ring-transparent transition-shadow ${ACCENTS[provider]}`}
    >
      <input type="hidden" name="provider" value={provider} />

      <div className="flex items-center justify-between gap-3">
        <div className="flex h-9 items-center gap-2">
          <Image
            src={logo.src}
            alt={LABELS[provider]}
            width={logo.width}
            height={logo.height}
            className={logo.standalone ? "h-7 w-auto object-contain" : "h-8 w-8 object-contain"}
          />
          {!logo.standalone && (
            <span className="font-semibold text-ink">{LABELS[provider]}</span>
          )}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isEnabled}
          aria-label={`Activer ${LABELS[provider]}`}
          onClick={() => setIsEnabled((v) => !v)}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 ${
            isEnabled ? "bg-brand" : "bg-clay"
          }`}
        >
          <input type="checkbox" name="enabled" checked={isEnabled} readOnly className="sr-only" />
          <span
            className={`inline-block h-4.5 w-4.5 transform rounded-full bg-paper shadow transition-transform ${
              isEnabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      <p className="mt-3 text-xs text-ink-soft">{SUBTITLES[provider]}</p>

      <p className="mt-2 text-xs font-medium">
        <span className={isEnabled ? "text-ok" : "text-ink-soft"}>
          {isEnabled ? "Activée" : "Désactivée"}
        </span>
      </p>

      {state?.success && (
        <p className="mt-3 flex items-center gap-1.5 rounded-md bg-clay px-3 py-2 text-xs text-ok">
          <Check className="h-3.5 w-3.5" /> Enregistré
        </p>
      )}
      {state?.error && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">
          {state.error}
        </p>
      )}

      <div className="mt-4 space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-soft">
            {fields.idLabel}
          </label>
          <input
            name="merchantId"
            defaultValue={merchantId ?? ""}
            placeholder={fields.idPlaceholder}
            autoComplete="off"
            className="w-full rounded-md border border-line-soft px-3 py-2 text-sm focus:border-ok focus:outline-none focus:ring-1 focus:ring-ink"
          />
          {fields.idHint && (
            <p className="mt-1 text-[11px] text-ink-soft">{fields.idHint}</p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-soft">
            {fields.keyLabel} {hasApiKey && <span className="text-ok">(déjà enregistrée)</span>}
          </label>
          <input
            name="apiKey"
            type="password"
            placeholder={hasApiKey ? "••••••••••••" : fields.keyPlaceholder}
            autoComplete="off"
            className="w-full rounded-md border border-line-soft px-3 py-2 text-sm focus:border-ok focus:outline-none focus:ring-1 focus:ring-ink"
          />
          <p className="mt-1 text-[11px] text-ink-soft">{fields.keyHint}</p>
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="mt-4 w-full rounded-md bg-ink px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-deep-line disabled:opacity-60"
      >
        {pending ? "Enregistrement..." : "Enregistrer"}
      </button>
    </form>
  );
}
