"use client";

import { useActionState, useState } from "react";
import { Check } from "lucide-react";
import { saveSmsGateway } from "@/lib/sms/actions";
import type { Provider } from "@/lib/sms/providers";

const LABELS: Record<Provider, string> = {
  wassoya: "Wassoya",
};

const COLORS: Record<Provider, string> = {
  wassoya: "bg-[#5B3DF5]",
};

const SUBTITLES: Record<Provider, string> = {
  wassoya: "SMS, WhatsApp et Email — wassoya.com. Authentification par clé API (Bearer).",
};

const SENDER_LABELS: Record<Provider, string> = {
  wassoya: "Nom d'expéditeur (from, 11 caractères max)",
};

export default function SmsGatewayCard({
  provider,
  senderId,
  enabled,
  hasApiKey,
}: {
  provider: Provider;
  senderId: string | null;
  enabled: boolean;
  hasApiKey: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveSmsGateway, undefined);
  const [isEnabled, setIsEnabled] = useState(enabled);

  return (
    <form action={formAction} className="rounded-xl border border-slate-200 bg-white p-5">
      <input type="hidden" name="provider" value={provider} />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white ${COLORS[provider]}`}
          >
            {LABELS[provider].slice(0, 1)}
          </span>
          <h3 className="font-semibold text-slate-900">{LABELS[provider]}</h3>
        </div>
      </div>
      <p className="mt-1.5 text-xs text-slate-500">{SUBTITLES[provider]}</p>
      <div className="mt-2 flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            name="enabled"
            checked={isEnabled}
            onChange={(e) => setIsEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Activée
        </label>
      </div>

      {state?.success && (
        <p className="mt-3 flex items-center gap-1.5 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          <Check className="h-3.5 w-3.5" /> Enregistré
        </p>
      )}
      {state?.error && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">{state.error}</p>
      )}

      <div className="mt-4 space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">
            {SENDER_LABELS[provider]}
          </label>
          <input
            name="senderId"
            defaultValue={senderId ?? ""}
            placeholder="SafeLinkHub"
            maxLength={11}
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
        className="mt-4 w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {pending ? "Enregistrement..." : "Enregistrer"}
      </button>
    </form>
  );
}
