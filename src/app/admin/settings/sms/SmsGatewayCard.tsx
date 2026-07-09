"use client";

import { useActionState, useState } from "react";
import Image from "next/image";
import { Check, Send } from "lucide-react";
import { saveSmsGateway, sendTestSms } from "@/lib/sms/actions";
import type { Provider } from "@/lib/sms/providers";

const LABELS: Record<Provider, string> = {
  wassoya: "Wassoya",
};

const LOGOS: Record<Provider, string> = {
  wassoya: "/wassoya.png",
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
  const [testState, testAction, testPending] = useActionState(sendTestSms, undefined);
  const [isEnabled, setIsEnabled] = useState(enabled);

  return (
    <div className="border-2 border-line bg-paper p-5">
    <form action={formAction}>
      <input type="hidden" name="provider" value={provider} />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Image
            src={LOGOS[provider]}
            alt={LABELS[provider]}
            width={512}
            height={512}
            className="h-8 w-8 object-contain"
          />
          <h3 className="font-semibold text-ink">{LABELS[provider]}</h3>
        </div>
      </div>
      <p className="mt-1.5 text-xs text-ink-soft">{SUBTITLES[provider]}</p>
      <div className="mt-2 flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <input
            type="checkbox"
            name="enabled"
            checked={isEnabled}
            onChange={(e) => setIsEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-line-soft"
          />
          Activée
        </label>
      </div>

      {state?.success && (
        <p className="mt-3 flex items-center gap-1.5 rounded-md bg-clay px-3 py-2 text-xs text-ok">
          <Check className="h-3.5 w-3.5" /> Enregistré
        </p>
      )}
      {state?.error && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">{state.error}</p>
      )}

      <div className="mt-4 space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-soft">
            {SENDER_LABELS[provider]}
          </label>
          <input
            name="senderId"
            defaultValue={senderId ?? ""}
            placeholder="SafeLinkHub"
            maxLength={11}
            autoComplete="off"
            className="w-full rounded-md border border-line-soft px-3 py-2 text-sm focus:border-ok focus:outline-none focus:ring-1 focus:ring-ink"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-soft">
            Clé API {hasApiKey && <span className="text-ok">(déjà enregistrée)</span>}
          </label>
          <input
            name="apiKey"
            type="password"
            placeholder={hasApiKey ? "••••••••••••" : "Clé API"}
            autoComplete="off"
            className="w-full rounded-md border border-line-soft px-3 py-2 text-sm focus:border-ok focus:outline-none focus:ring-1 focus:ring-ink"
          />
          <p className="mt-1 text-[11px] text-ink-soft">
            Laissez vide pour conserver la clé actuelle.
          </p>
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="mt-4 w-full rounded-md bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-[#3A362F] disabled:opacity-60"
      >
        {pending ? "Enregistrement..." : "Enregistrer"}
      </button>
    </form>

      {hasApiKey && enabled && (
        <form action={testAction} className="mt-5 border-t border-line-soft pt-4">
          <label className="mb-1 block text-xs font-medium text-ink-soft">
            Envoyer un SMS test
          </label>
          <div className="flex gap-2">
            <input
              name="to"
              type="tel"
              placeholder="2250700000000"
              autoComplete="off"
              className="w-full rounded-md border border-line-soft px-3 py-2 text-sm focus:border-ok focus:outline-none focus:ring-1 focus:ring-ink"
            />
            <button
              type="submit"
              disabled={testPending}
              className="flex shrink-0 items-center gap-1.5 rounded-md border border-line px-3 py-2 text-sm font-medium text-ink hover:bg-clay disabled:opacity-60"
            >
              <Send className="h-3.5 w-3.5" />
              {testPending ? "Envoi..." : "Tester"}
            </button>
          </div>
          <p className="mt-1 text-[11px] text-ink-soft">
            Numéro au format international, sans le +.
          </p>
          {testState?.success && (
            <p className="mt-2 flex items-center gap-1.5 rounded-md bg-clay px-3 py-2 text-xs text-ok">
              <Check className="h-3.5 w-3.5" /> SMS envoyé
              {testState.messageId ? ` (${testState.messageId})` : ""}
            </p>
          )}
          {testState?.error && (
            <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">
              {testState.error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
