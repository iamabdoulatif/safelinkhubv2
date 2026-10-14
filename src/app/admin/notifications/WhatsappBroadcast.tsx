"use client";

import { useMemo, useState } from "react";
import { MessageCircle, Send } from "lucide-react";
import { waMeLink, type WhatsappRecipient } from "@/lib/notifications/whatsapp-shared";
import { sendWhatsappBroadcastApi } from "@/lib/notifications/whatsapp-actions";

type ApiResult = {
  configured: boolean;
  sent: string[];
  failed: { org: string; error: string }[];
  skipped: string[];
};

export default function WhatsappBroadcast({
  recipients,
  apiConfigured,
  defaultMessage,
}: {
  recipients: WhatsappRecipient[];
  apiConfigured: boolean;
  defaultMessage: string;
}) {
  const [message, setMessage] = useState(defaultMessage);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ApiResult | string | null>(null);

  const withNumber = useMemo(() => recipients.filter((r) => r.digits), [recipients]);
  const withoutNumber = recipients.length - withNumber.length;

  async function broadcastApi() {
    if (busy) return;
    if (!confirm(`Envoyer via l'API WhatsApp à ${withNumber.length} organisation(s) ?`)) return;
    setBusy(true);
    setResult(null);
    const res = await sendWhatsappBroadcastApi(message);
    setResult("error" in res ? res.error : res);
    setBusy(false);
  }

  return (
    <div className="mt-6 space-y-6">
      <div className="border border-line bg-paper p-4 sm:p-5 rounded-xl">
        <label htmlFor="wa-msg" className="block text-sm font-semibold text-ink">
          Message
        </label>
        <textarea
          id="wa-msg"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          className="mt-2 w-full resize-y rounded-xl border border-line bg-white p-3 text-sm text-ink focus:border-brand-deep focus:outline-none"
        />
        <p className="mt-2 text-xs text-ink-soft">
          Les mots de passe ne sont pas envoyés en clair : le message renvoie l’organisation à son tableau de bord.
        </p>
      </div>

      {/* Voie 2 : envoi automatique via l'API Cloud (si configurée). */}
      <div className="border border-line bg-paper p-4 sm:p-5 rounded-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-ink">Envoi automatique (API WhatsApp Cloud)</p>
            <p className="mt-0.5 text-xs text-ink-soft">
              {apiConfigured
                ? `Prêt — ${withNumber.length} organisation(s) avec un numéro.`
                : "Non configuré : définir WHATSAPP_TOKEN / WHATSAPP_PHONE_ID (+ modèle Meta approuvé) pour activer."}
            </p>
          </div>
          <button
            type="button"
            onClick={broadcastApi}
            disabled={!apiConfigured || busy || withNumber.length === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-bold text-slate-deep hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {busy ? "Envoi…" : "Envoyer à tous via l’API"}
          </button>
        </div>
        {typeof result === "string" && (
          <p className="mt-3 text-sm font-medium text-err">{result}</p>
        )}
        {result && typeof result !== "string" && (
          <div className="mt-3 space-y-1 text-sm">
            {!result.configured && (
              <p className="font-medium text-err">API non configurée : aucun envoi.</p>
            )}
            {result.sent.length > 0 && (
              <p className="text-ink">✅ Envoyé : {result.sent.length} ({result.sent.join(", ")})</p>
            )}
            {result.failed.length > 0 && (
              <p className="text-err">
                ❌ Échecs : {result.failed.map((f) => `${f.org} (${f.error})`).join(", ")}
              </p>
            )}
            {result.skipped.length > 0 && (
              <p className="text-ink-soft">Ignorées (sans numéro) : {result.skipped.join(", ")}</p>
            )}
          </div>
        )}
      </div>

      {/* Voie 1 : liens wa.me prêts à envoyer, un par organisation. */}
      <div>
        <p className="text-sm font-semibold text-ink">
          Envoi manuel — {withNumber.length} organisation(s)
          {withoutNumber > 0 && ` · ${withoutNumber} sans numéro`}
        </p>
        <ul className="mt-3 space-y-2" role="list">
          {recipients.map((r) => (
            <li
              key={r.orgId}
              className="flex flex-wrap items-center justify-between gap-2 border border-line bg-paper px-4 py-3 rounded-xl"
            >
              <div className="min-w-0">
                <p className="font-medium text-ink">{r.orgName}</p>
                <p className="text-xs text-ink-soft">
                  {r.display ?? "Aucun numéro"} · {r.mikhmonRouters} routeur{r.mikhmonRouters > 1 ? "s" : ""} MikHmon
                </p>
              </div>
              {r.digits ? (
                <a
                  href={waMeLink(r.digits, message.replace(/\{org\}/g, r.orgName))}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-line px-3 py-1.5 text-xs font-bold text-ink hover:bg-clay"
                >
                  <MessageCircle className="h-4 w-4" />
                  Envoyer
                </a>
              ) : (
                <span className="shrink-0 text-xs text-ink-soft">—</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
