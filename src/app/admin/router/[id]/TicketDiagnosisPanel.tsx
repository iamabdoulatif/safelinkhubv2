"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Loader2, RotateCw, Stethoscope } from "lucide-react";
import { diagnoseTicketConnectivity, repairTicketPortal } from "@/lib/mikrotik/serial-transfer-actions";

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
 * En lecture, à UNE exception : quand le journal porte la signature d'un
 * portail qui ne s'affiche plus (nouveaux appareils, aucun formulaire — voir
 * hotspot-portal-health.ts), le remède est toujours le même et sans arbitrage :
 * relancer le serveur hotspot. Il est proposé ici, derrière une confirmation,
 * pour ne plus dépendre d'un accès Winbox.
 */
export default function TicketDiagnosisPanel({ routerId }: { routerId: string }) {
  const [code, setCode] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Diagnosis | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [repairing, startRepair] = useTransition();
  const [repairMsg, setRepairMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function repair() {
    setConfirming(false);
    startRepair(async () => {
      setRepairMsg(null);
      const res = await repairTicketPortal(routerId);
      setRepairMsg("error" in res ? { ok: false, text: res.error } : { ok: true, text: res.summary });
    });
  }

  return (
    <section className="mt-6 border border-line bg-paper p-5 rounded-xl">
      <div className="flex items-center gap-2">
        <Stethoscope className="h-4.5 w-4.5 text-ink" aria-hidden="true" />
        <h2 className="font-display text-base font-bold text-ink">
          Pourquoi un ticket ne se connecte pas
        </h2>
      </div>
      <p className="mt-1.5 text-sm leading-6 text-ink-soft">
        Lit l&apos;état vivant du routeur — adresses disponibles, sessions ouvertes, cookies, et le
        journal du hotspot. N&apos;écrit rien, sauf la réparation proposée quand le portail ne
        s&apos;affiche plus.
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
          className="w-56 border border-line bg-paper px-3 py-2 font-mono text-sm text-ink focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink rounded-xl"
        />
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-2 border border-line bg-paper px-4 py-2 text-sm font-bold text-ink hover:bg-clay disabled:cursor-not-allowed disabled:opacity-60 rounded-xl"
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
          {result.portal.verdict === "suspect" && (
            <div className="border border-err bg-err/10 p-4 rounded-xl">
              <p className="flex items-start gap-2 text-sm font-bold text-ink">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-err" aria-hidden="true" />
                Le portail ne s&apos;affiche probablement pas
              </p>
              <p className="mt-1.5 text-xs leading-5 text-ink-soft">
                {result.portal.newDevices} nouveaux appareils ont tenté de se connecter sans qu&apos;un
                seul formulaire soit soumis ({result.portal.cookieLogins} reconnexions par cookie
                seulement). C&apos;est la signature du proxy DNS du hotspot mort en silence : les
                clients n&apos;ont plus de DNS, donc jamais de page. Relancer le serveur «{" "}
                {result.serverName ?? "hotspot"} » le ressuscite. Les sessions tombent trois secondes
                et reviennent seules par cookie.
              </p>
              {confirming ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-ink">
                    Relancer le serveur hotspot maintenant ?
                  </span>
                  <button
                    type="button"
                    disabled={repairing}
                    onClick={repair}
                    className="inline-flex items-center gap-1.5 border border-err bg-err px-3 py-1.5 text-xs font-bold text-white transition-colors duration-150 hover:bg-paper hover:text-err disabled:opacity-60 rounded-lg"
                  >
                    {repairing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    Confirmer
                  </button>
                  <button
                    type="button"
                    disabled={repairing}
                    onClick={() => setConfirming(false)}
                    className="border border-line bg-paper px-3 py-1.5 text-xs font-bold text-ink transition-colors duration-150 hover:bg-clay disabled:opacity-60 rounded-lg"
                  >
                    Annuler
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={repairing}
                  onClick={() => setConfirming(true)}
                  className="mt-3 inline-flex items-center gap-1.5 border border-err px-3 py-1.5 text-xs font-bold text-err transition-colors duration-150 hover:bg-err/10 disabled:opacity-60 rounded-lg"
                >
                  {repairing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  Relancer le serveur hotspot
                </button>
              )}
              {repairMsg && (
                <p
                  role="status"
                  className={`mt-3 text-xs font-medium ${repairMsg.ok ? "text-ok" : "text-err"}`}
                >
                  {repairMsg.text}
                </p>
              )}
            </div>
          )}

          <ul className="space-y-1.5">
            {result.findings
              .filter((f) => !f.startsWith("Le portail ne s'affiche probablement pas"))
              .map((finding) => (
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
              <pre className="mt-1 max-h-48 overflow-auto border border-line-soft bg-clay/40 p-2 font-mono text-[11px] leading-5 text-ink-soft rounded-xl">
                {result.recentLog.join("\n")}
              </pre>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
