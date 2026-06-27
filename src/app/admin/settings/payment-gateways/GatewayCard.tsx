"use client";

import { useActionState, useState } from "react";
import Image from "next/image";
import { Check } from "lucide-react";
import { savePaymentGateway } from "@/lib/payment-gateways/actions";
import type { Provider } from "@/lib/payment-gateways/providers";

const LOGOS: Record<Provider, { src: string; width: number; height: number }> = {
  paystack: { src: "/Paystack.png", width: 1354, height: 626 },
  genius_pay: { src: "/geniuspay.svg", width: 712, height: 205 },
};

const LABELS: Record<Provider, string> = {
  genius_pay: "Genius Pay",
  paystack: "Paystack",
};

const ACCENTS: Record<Provider, string> = {
  genius_pay: "hover:ring-violet-200",
  paystack: "hover:ring-sky-200",
};

const SUBTITLES: Record<Provider, string> = {
  paystack: "Couvre Wave, Orange Money, Moov Money, MTN MoMo et carte bancaire en interne.",
  genius_pay: "Couvre Wave, Orange Money, Moov Money, MTN MoMo et carte bancaire en interne.",
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

  return (
    <form
      action={formAction}
      className={`rounded-xl border border-slate-200 bg-white p-5 ring-1 ring-transparent transition-shadow ${ACCENTS[provider]}`}
    >
      <input type="hidden" name="provider" value={provider} />

      <div className="flex items-center justify-between gap-3">
        <div className="flex h-9 items-center">
          <Image
            src={logo.src}
            alt={LABELS[provider]}
            width={logo.width}
            height={logo.height}
            className="h-7 w-auto object-contain"
          />
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isEnabled}
          onClick={() => setIsEnabled((v) => !v)}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
            isEnabled ? "bg-emerald-500" : "bg-slate-200"
          }`}
        >
          <input type="checkbox" name="enabled" checked={isEnabled} readOnly className="sr-only" />
          <span
            className={`inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow transition-transform ${
              isEnabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      <p className="mt-3 text-xs text-slate-500">{SUBTITLES[provider]}</p>

      <p className="mt-2 text-xs font-medium">
        <span className={isEnabled ? "text-emerald-600" : "text-slate-400"}>
          {isEnabled ? "Activée" : "Désactivée"}
        </span>
      </p>

      {state?.success && (
        <p className="mt-3 flex items-center gap-1.5 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
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
          <label className="mb-1 block text-xs font-medium text-slate-500">
            Identifiant marchand
          </label>
          <input
            name="merchantId"
            defaultValue={merchantId ?? ""}
            placeholder="ID marchand"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">
            Clé API {hasApiKey && <span className="text-emerald-600">(déjà enregistrée)</span>}
          </label>
          <input
            name="apiKey"
            type="password"
            placeholder={hasApiKey ? "••••••••••••" : "Clé API"}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
          />
          <p className="mt-1 text-[11px] text-slate-400">
            Laissez vide pour conserver la clé actuelle.
          </p>
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="mt-4 w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-60"
      >
        {pending ? "Enregistrement..." : "Enregistrer"}
      </button>
    </form>
  );
}
