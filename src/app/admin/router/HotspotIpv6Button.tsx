"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldAlert } from "lucide-react";
import { fixFleetHotspotIpv6, scanFleetHotspotIpv6 } from "@/lib/mikrotik/actions";

type Scan = {
  scanned: number;
  leaking: { router: string; verdict: string }[];
  clean: { router: string; verdict: string }[];
  unreachable: string[];
};

/**
 * Fuite du portail captif en IPv6 : DIAGNOSTIC d'abord, correction ensuite.
 *
 * Le hotspot MikroTik n'intercepte que l'IPv4 ; un client qui reçoit de l'IPv6
 * sort sans passer par le portail, donc sans payer. Le premier bouton ne fait
 * que lire — c'est délibéré : on ne modifie pas le réseau de clients en
 * production sans avoir vu qui est réellement concerné.
 */
export default function HotspotIpv6Button() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [scan, setScan] = useState<Scan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        title="Lecture seule : vérifie si des clients hotspot peuvent sortir en IPv6 sans passer par le portail."
        onClick={() =>
          startTransition(async () => {
            setError(null);
            setDone(null);
            setScan(null);
            const result = await scanFleetHotspotIpv6();
            if ("error" in result) {
              setError(result.error);
              return;
            }
            setScan(result);
          })
        }
        className="flex items-center gap-2 border-2 border-line bg-paper px-4 py-2 text-sm font-bold text-ink transition-colors duration-150 hover:bg-clay disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? (
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
        ) : (
          <ShieldAlert aria-hidden="true" className="h-4 w-4" />
        )}
        {pending ? "Analyse..." : "Vérifier la fuite IPv6"}
      </button>

      {error && <span className="text-xs text-err">{error}</span>}
      {done && <span className="max-w-md text-xs text-ok">{done}</span>}

      {scan && !done && (
        <div className="w-full border-2 border-line-soft bg-clay/50 p-3 text-xs">
          <p className="font-bold text-ink">
            {scan.leaking.length === 0
              ? `Aucune fuite sur les ${scan.scanned} routeur(s) joignables.`
              : `${scan.leaking.length} routeur(s) en fuite sur ${scan.scanned} analysés.`}
          </p>
          {scan.leaking.length > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {scan.leaking.map((r) => (
                <li key={r.router} className="text-ink-soft">
                  <strong className="text-ink">{r.router}</strong> — {r.verdict}
                </li>
              ))}
            </ul>
          )}
          {scan.unreachable.length > 0 && (
            <p className="mt-1.5 text-warn">Hors ligne : {scan.unreachable.join(", ")}.</p>
          )}
          {scan.leaking.length > 0 && (
            <>
              <p className="mt-2 text-ink-soft">
                La correction coupe les annonces IPv6 vers les clients et jette leur trafic IPv6.
                L&apos;IPv6 propre au routeur (management, tunnel) n&apos;est pas touchée, et les deux
                réglages sont marqués pour être retirés d&apos;un geste.
              </p>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    setError(null);
                    const result = await fixFleetHotspotIpv6();
                    if ("error" in result) {
                      setError(result.error);
                      return;
                    }
                    setDone(
                      result.fixed.length === 0
                        ? "Rien à corriger."
                        : `Fuite fermée sur ${result.fixed.map((f) => f.router).join(", ")}.` +
                            (result.unreachable.length > 0
                              ? ` Hors ligne, à relancer : ${result.unreachable.join(", ")}.`
                              : ""),
                    );
                    setScan(null);
                    router.refresh();
                  })
                }
                className="mt-2 border-2 border-line bg-brand px-3 py-1.5 text-xs font-bold text-[#1C1917] hover:opacity-90 disabled:opacity-60"
              >
                Fermer la fuite sur ces {scan.leaking.length} routeur(s)
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
