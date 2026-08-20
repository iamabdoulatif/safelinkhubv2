"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRightLeft, Check, Loader2, ScanLine } from "lucide-react";
import {
  inspectRouterSerialLock,
  transferRouterSerialToThisRouter,
} from "@/lib/mikrotik/serial-transfer-actions";

type Holder = { routerName: string; orgName: string; lockedAt: string };

/**
 * Panneau superadmin : pourquoi ce routeur reste hors ligne, et comment le
 * débloquer.
 *
 * Le verrou de numéro de série gardait le routeur hors ligne SANS QUE LE MOTIF
 * REMONTE : la cause était parfaitement identifiée côté serveur mais finissait
 * dans un log que personne ne lit, et l'écran affichait un banal « hors ligne »
 * qui envoyait chercher un problème réseau inexistant.
 *
 * Deux temps délibérés : on lit d'abord (aucune écriture), on transfère
 * ensuite. Un transfert retire l'appareil du compte d'un tiers — ça se décide
 * en connaissant le nom de celui qui le détient, pas à l'aveugle.
 */
export default function SerialLockPanel({ routerId }: { routerId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [scan, setScan] = useState<{ serial: string; blocked: boolean; holder: Holder | null } | null>(
    null,
  );
  const [confirming, setConfirming] = useState(false);

  return (
    <section className="mt-6 border border-line bg-paper p-5 rounded-xl">
      <div className="flex items-center gap-2">
        <ScanLine className="h-4.5 w-4.5 text-ink" aria-hidden="true" />
        <h2 className="font-display text-base font-bold text-ink">Verrou de numéro de série</h2>
        <span className="ml-auto rounded-sm bg-clay px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-ink-soft">
          Superadmin
        </span>
      </div>
      <p className="mt-1.5 text-sm leading-6 text-ink-soft">
        Un MikroTik rattaché à un compte ne peut pas être remis en service sur un autre : c&apos;est
        ce qui empêche un boîtier revendu ou volé de réapparaître ailleurs. Si ce routeur reste hors
        ligne alors que son tunnel fonctionne, c&apos;est souvent ça.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              setDone(null);
              setConfirming(false);
              const result = await inspectRouterSerialLock(routerId);
              if ("error" in result) {
                setError(result.error);
                setScan(null);
                return;
              }
              setScan({ serial: result.serial, blocked: result.blocked, holder: result.holder });
            })
          }
          className="flex items-center gap-2 border border-line bg-paper px-4 py-2 text-sm font-bold text-ink hover:bg-clay disabled:cursor-not-allowed disabled:opacity-60 rounded-xl"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <ScanLine className="h-4 w-4" aria-hidden="true" />
          )}
          {pending ? "Lecture..." : "Vérifier le verrou"}
        </button>
        {error && <span className="text-xs text-err">{error}</span>}
        {done && (
          <span className="inline-flex items-center gap-1.5 text-xs text-ok">
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            {done}
          </span>
        )}
      </div>

      {scan && !done && (
        <div className="mt-4 border border-line-soft bg-clay/40 p-3 rounded-xl">
          <p className="text-sm text-ink">
            Numéro de série : <strong className="font-mono">{scan.serial}</strong>
          </p>

          {!scan.blocked ? (
            <p className="mt-1.5 text-sm text-ok">
              Aucun verrou détenu ailleurs — si ce routeur est hors ligne, la cause est autre.
            </p>
          ) : (
            <>
              <div className="mt-2 flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden="true" />
                <p className="text-sm text-ink">
                  Ce boîtier est rattaché à <strong>{scan.holder?.routerName}</strong>, dans
                  l&apos;organisation <strong>{scan.holder?.orgName}</strong>. Tant que le verrou y
                  reste, ce routeur-ci est gardé hors ligne.
                </p>
              </div>

              {!confirming ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setConfirming(true)}
                  className="mt-3 flex items-center gap-2 border border-line bg-brand px-3 py-1.5 text-xs font-bold text-slate-deep hover:opacity-90 disabled:opacity-60 rounded-full"
                >
                  <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  Transférer le boîtier vers ce routeur
                </button>
              ) : (
                <div className="mt-3 border border-warn bg-paper p-3">
                  <p className="text-sm font-bold text-ink">Confirmer le transfert</p>
                  <p className="mt-1 text-sm leading-6 text-ink-soft">
                    L&apos;appareil sera retiré du compte de{" "}
                    <strong className="text-ink">{scan.holder?.orgName}</strong>. Leur routeur{" "}
                    <strong className="text-ink">{scan.holder?.routerName}</strong> passera à son tour
                    hors ligne dès sa prochaine synchronisation, et ne pourra plus être remis en
                    service tant que le boîtier restera ici. L&apos;opération est tracée dans le
                    journal d&apos;audit des deux organisations.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          setError(null);
                          const result = await transferRouterSerialToThisRouter(routerId);
                          if ("error" in result) {
                            setError(result.error);
                            return;
                          }
                          setDone(result.summary);
                          setScan(null);
                          setConfirming(false);
                          router.refresh();
                        })
                      }
                      className="border border-line bg-ink px-3 py-1.5 text-xs font-bold text-paper hover:opacity-90 disabled:opacity-60"
                    >
                      {pending ? "Transfert..." : "Oui, transférer"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(false)}
                      className="border border-line-soft px-3 py-1.5 text-xs font-bold text-ink-soft hover:bg-clay rounded-xl"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
