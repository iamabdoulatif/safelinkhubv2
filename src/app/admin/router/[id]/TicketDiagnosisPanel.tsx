"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Loader2, Stethoscope } from "lucide-react";
import { diagnoseTicketConnectivity } from "@/lib/mikrotik/serial-transfer-actions";

type Diagnosis = Extract<
  Awaited<ReturnType<typeof diagnoseTicketConnectivity>>,
  { success: true }
>;

/**
 * « Pourquoi ce ticket ne se connecte pas ? »
 *
 * Un ticket refusé l'est souvent pour une raison qui n'a rien à voir avec lui :
 * pool d'adresses saturé, session déjà ouverte, cookie MAC qui reconnecte
 * l'appareil sous son ancien code. Rien de tout cela n'apparaît dans les
 * sauvegardes — il fallait ouvrir Winbox. Ce panneau va chercher l'état vivant
 * et, surtout, les lignes de journal où RouterOS écrit lui-même le motif.
 *
 * Strictement en lecture : les remèdes diffèrent selon la cause, et certains
 * relèvent d'un arbitrage produit qui n'appartient pas à un bouton.
 */
export default function TicketDiagnosisPanel({ routerId }: { routerId: string }) {
  const [code, setCode] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Diagnosis | null>(null);

  return (
    <section className="mt-6 border-2 border-line bg-paper p-5">
      <div className="flex items-center gap-2">
        <Stethoscope className="h-4.5 w-4.5 text-ink" aria-hidden="true" />
        <h2 className="font-display text-base font-bold text-ink">
          Pourquoi un ticket ne se connecte pas
        </h2>
      </div>
      <p className="mt-1.5 text-sm leading-6 text-ink-soft">
        Lit l&apos;état vivant du routeur — adresses disponibles, sessions ouvertes, cookies, et le
        journal du hotspot. Aucune écriture.
      </p>

      <form
        className="mt-4 flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            setError(null);
            setResult(null);
            const res = await diagnoseTicketConnectivity(routerId, code);
            if ("error" in res) {
              setError(res.error);
              return;
            }
            setResult(res);
          });
        }}
      >
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.trim())}
          placeholder="code du ticket (facultatif)"
          aria-label="Code du ticket à diagnostiquer"
          className="w-56 border-2 border-line bg-paper px-3 py-2 font-mono text-sm text-ink focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        />
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-2 border-2 border-line bg-paper px-4 py-2 text-sm font-bold text-ink hover:bg-clay disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Stethoscope className="h-4 w-4" aria-hidden="true" />
          )}
          {pending ? "Analyse..." : "Diagnostiquer"}
        </button>
        {error && <span className="text-xs text-err">{error}</span>}
      </form>

      {result && (
        <div className="mt-4 space-y-3">
          <ul className="space-y-1.5">
            {result.findings.map((finding) => (
              <li key={finding} className="flex items-start gap-2 text-sm text-ink">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden="true" />
                <span>{finding}</span>
              </li>
            ))}
          </ul>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-line-soft pt-3 text-xs sm:grid-cols-4">
            <div>
              <dt className="text-ink-soft">Adresses utilisées</dt>
              <dd className="font-mono font-bold text-ink">
                {result.pool ? `${result.pool.used}/${result.pool.total} (${result.pool.saturation}%)` : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-ink-soft">Sessions ouvertes</dt>
              <dd className="font-mono font-bold text-ink">{result.activeSessions}</dd>
            </div>
            <div>
              <dt className="text-ink-soft">Cookies MAC</dt>
              <dd className="font-mono font-bold text-ink">{result.macCookies}</dd>
            </div>
            <div>
              <dt className="text-ink-soft">login-by</dt>
              <dd className="truncate font-mono text-ink" title={result.loginBy}>
                {result.loginBy || "—"}
              </dd>
            </div>
          </dl>

          {result.ticket?.found && (
            <p className="text-xs text-ink-soft">
              Ticket <span className="font-mono font-bold text-ink">{code}</span> · profil{" "}
              <span className="font-mono">{result.ticket.profile}</span> ·{" "}
              {result.ticket.neverUsed ? "jamais activé" : "déjà activé"} ·{" "}
              {result.ticket.disabled ? "DÉSACTIVÉ" : "actif"}
            </p>
          )}

          {result.recentLog.length > 0 && (
            <div>
              <p className="text-xs font-bold text-ink">Journal hotspot du routeur</p>
              <pre className="mt-1 max-h-48 overflow-auto border-2 border-line-soft bg-clay/40 p-2 font-mono text-[11px] leading-5 text-ink-soft">
                {result.recentLog.join("\n")}
              </pre>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
