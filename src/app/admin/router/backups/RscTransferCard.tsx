"use client";

/**
 * Transfert sélectif depuis un export `.rsc`.
 *
 * CARTE À PART, et pas une option de la restauration `.backup` : les deux
 * gestes n'ont ni le même effet ni le même risque. Une restauration binaire
 * remplace TOUTE la configuration du routeur — elle ne vaut que sur le même
 * équipement. Le transfert, lui, n'emporte que les tickets, profils,
 * schedulers, pool et recettes, et ne touche pas au réseau du routeur
 * d'accueil. Les fondre dans un même formulaire inviterait à confondre une
 * opération réversible avec une opération qui ne l'est pas.
 */

import { useEffect, useRef, useState, useTransition, type ChangeEvent } from "react";
import { AlertTriangle, ArrowRightLeft, Check, FileUp, Loader2 } from "lucide-react";
import { planifierTransfertRsc, demarrerTransfertRscJob } from "@/lib/mikrotik/rsc-transfer-actions";
import { getRestoreJob } from "@/lib/mikrotik/backup-actions";

type RouterRow = { id: string; name: string; status: string };
type Cible = { poolName: string; poolRanges: string; hotspotServer: string; hotspotBridge: string };
type Resume = { section: string; retenues: number }[];

const LIBELLES: Record<string, string> = {
  "/ip pool": "Pool d’adresses",
  "/ip hotspot user profile": "Profils (durées et tarifs)",
  "/ip hotspot user": "Tickets",
  "/system scheduler": "Schedulers d’expiration",
  "/system script": "Historique des ventes",
};

export default function RscTransferCard({ routers }: { routers: RouterRow[] }) {
  const [rsc, setRsc] = useState<string | null>(null);
  const [nomFichier, setNomFichier] = useState("");
  const [cibleId, setCibleId] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [plan, setPlan] = useState<{ resume: Resume; ecartees: string[]; cible: Cible; total: number } | null>(null);
  const [bilan, setBilan] = useState<{ posees: number; echecs: { commande: string; raison: string }[] } | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [avancement, setAvancement] = useState<{ posees: number; total: number } | null>(null);
  const [occupe, demarrer] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const enLigne = routers.filter((r) => r.status === "online");

  async function choisirFichier(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setErreur(null);
    setPlan(null);
    setBilan(null);
    const texte = await f.text();
    /* Le contrôle du format vit côté serveur, sur la signature du fichier —
       ici on ne fait que lire. Un `.backup` déposé par erreur recevra le
       message qui explique comment obtenir un export texte. */
    setRsc(texte);
    setNomFichier(f.name);
  }

  function apercu() {
    if (!rsc || !cibleId) return;
    setErreur(null);
    setBilan(null);
    demarrer(async () => {
      const r = await planifierTransfertRsc(cibleId, rsc);
      if ("error" in r && r.error) {
        setErreur(r.error);
        setPlan(null);
        return;
      }
      if (r.success && r.resume && r.ecartees && r.cible) {
        setPlan({ resume: r.resume, ecartees: r.ecartees, cible: r.cible, total: r.total ?? 0 });
      }
    });
  }

  function appliquer() {
    if (!rsc || !cibleId) return;
    setErreur(null);
    setBilan(null);
    setAvancement({ posees: 0, total: plan?.total ?? 0 });
    demarrer(async () => {
      const r = await demarrerTransfertRscJob(cibleId, rsc);
      if ("error" in r && r.error) {
        setErreur(r.error);
        setAvancement(null);
        return;
      }
      if (r.success) setJobId(r.jobId); // déclenche le sondage ci-dessous
    });
  }

  // Sondage du job de transfert : chaque requête est brève (bien en deçà des
  // ~100 s de Cloudflare), donc un transfert de plusieurs minutes tient. Le
  // travail vit côté serveur (after()) — fermer l'onglet ne l'arrête pas.
  useEffect(() => {
    if (!jobId) return;
    let vivant = true;
    let timer: ReturnType<typeof setTimeout>;
    const sonder = async () => {
      const r = await getRestoreJob(jobId);
      if (!vivant) return;
      if (!("success" in r) || !r.success) {
        setErreur(("error" in r && r.error) || "Suivi du transfert indisponible.");
        setJobId(null);
        setAvancement(null);
        return;
      }
      if (r.stale) {
        setErreur("Le transfert semble interrompu (serveur redémarré ?). Relancez-le.");
        setJobId(null);
        setAvancement(null);
        return;
      }
      const p = (r.progress ?? {}) as {
        posees?: number;
        total?: number;
        echecs?: { commande: string; raison: string }[];
      };
      if (r.status === "running") {
        setAvancement({ posees: p.posees ?? 0, total: p.total ?? 0 });
        timer = setTimeout(sonder, 1500);
        return;
      }
      if (r.status === "done") {
        setBilan({ posees: p.posees ?? 0, echecs: p.echecs ?? [] });
        setAvancement(null);
        setJobId(null);
        return;
      }
      setErreur(r.error || "Transfert échoué.");
      setAvancement(null);
      setJobId(null);
    };
    sonder();
    return () => {
      vivant = false;
      clearTimeout(timer);
    };
  }, [jobId]);

  return (
    <div className="rounded-xl border border-line bg-paper p-4 sm:p-5">
      <h2 className="text-[15px] font-semibold text-ink">
        Transférer les tickets d’un ancien routeur (.rsc)
      </h2>
      <p className="mt-1 text-sm leading-6 text-ink-soft">
        Déposez un export texte (<code>/export file=transfert</code>) de l’ancien MikroTik. Seuls les{" "}
        <strong>tickets, profils, schedulers, pool et l’historique des ventes</strong> sont repris, et
        adaptés au routeur d’accueil. Sa configuration réseau — tunnel, clés, bridge, pare-feu — n’est
        pas touchée.
      </p>

      <div className="mt-4 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="cursor-pointer">
            <input
              ref={fileRef}
              type="file"
              accept=".rsc,.txt,.backup,text/plain"
              onChange={choisirFichier}
              className="hidden"
            />
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-brand px-4 py-2 text-sm font-semibold text-slate-deep transition hover:bg-brand/80">
              <FileUp className="h-4 w-4" />
              Choisir un fichier .rsc
            </span>
          </label>
          {nomFichier && <span className="font-mono text-xs text-ink-soft">{nomFichier}</span>}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex-1 min-w-[240px]">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-soft">
              Routeur d’accueil
            </span>
            <select
              value={cibleId}
              onChange={(e) => {
                setCibleId(e.target.value);
                setPlan(null);
                setBilan(null);
              }}
              className="w-full rounded-lg border border-line-soft bg-paper px-3 py-2 text-sm text-ink"
            >
              <option value="">Choisir…</option>
              {enLigne.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={apercu}
            disabled={!rsc || !cibleId || occupe || !!jobId}
            className="btn btn-md btn-outline inline-flex items-center gap-2"
          >
            {occupe && <Loader2 className="h-4 w-4 animate-spin" />}
            Voir ce qui sera transféré
          </button>
        </div>

        {/* Seuls les routeurs EN LIGNE sont proposés : le plan se construit en
            lisant le pool et le serveur hotspot sur l'appareil. */}
        {enLigne.length === 0 && (
          <p className="text-xs text-warn">Aucun routeur en ligne — le transfert lit le routeur d’accueil.</p>
        )}

        {erreur && (
          <p className="flex items-start gap-2 rounded-lg border border-err/30 bg-err/10 px-3 py-2 text-sm leading-6 text-err">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {erreur}
          </p>
        )}

        {plan && !bilan && (
          <div className="rounded-lg border border-line-soft bg-clay p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
              Ce qui sera posé — {plan.total} éléments
            </p>
            <ul className="mt-2 space-y-1 text-sm text-ink">
              {plan.resume.map((r) => (
                <li key={r.section} className="flex justify-between gap-4">
                  <span>{LIBELLES[r.section] ?? r.section}</span>
                  <span className="font-bold tabular-nums">{r.retenues}</span>
                </li>
              ))}
            </ul>

            <p className="mt-4 text-xs leading-5 text-ink-soft">
              Adapté au routeur d’accueil : pool <strong>{plan.cible.poolName}</strong>{" "}
              ({plan.cible.poolRanges}), serveur <strong>{plan.cible.hotspotServer}</strong> sur le
              bridge <strong>{plan.cible.hotspotBridge}</strong>.
            </p>

            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-semibold text-ink-soft">
                {plan.ecartees.length} sections écartées — tunnel, bridges, pare-feu…
              </summary>
              <p className="mt-2 font-mono text-xs leading-5 text-ink-soft">
                {plan.ecartees.join(" · ")}
              </p>
            </details>

            <button
              type="button"
              onClick={appliquer}
              disabled={occupe || !!jobId}
              className="btn btn-md btn-primary mt-4 inline-flex items-center gap-2"
            >
              {occupe || jobId ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowRightLeft className="h-4 w-4" />
              )}
              {jobId ? "Transfert en cours…" : "Transférer sur ce routeur"}
            </button>

            {avancement && (
              <div className="mt-3">
                <div className="flex justify-between text-xs text-ink-soft">
                  <span>Transfert en tâche de fond…</span>
                  <span className="tabular-nums">
                    {avancement.posees}
                    {avancement.total ? ` / ${avancement.total}` : ""}
                  </span>
                </div>
                {avancement.total > 0 && (
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-line-soft">
                    <div
                      className="h-full rounded-full bg-brand transition-all"
                      style={{
                        width: `${Math.min(100, Math.round((avancement.posees / avancement.total) * 100))}%`,
                      }}
                    />
                  </div>
                )}
                <p className="mt-1 text-xs leading-5 text-ink-soft">
                  Vous pouvez laisser cette page ouverte ; le transfert continue côté serveur.
                </p>
              </div>
            )}
          </div>
        )}

        {bilan && (
          <div className="rounded-lg border border-ok/30 bg-ok/10 p-4">
            <p className="flex items-center gap-2 text-sm font-bold text-ok">
              <Check className="h-4 w-4" />
              {bilan.posees} éléments posés sur le routeur.
            </p>
            {bilan.echecs.length > 0 ? (
              <>
                {/* Les refus sont NOMMÉS : un `/import` se serait arrêté au
                    premier sans dire lequel, laissant le reste en plan. */}
                <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-warn">
                  {bilan.echecs.length} refusés par RouterOS
                </p>
                <ul className="mt-1 space-y-1 font-mono text-xs leading-5 text-ink-soft">
                  {bilan.echecs.slice(0, 8).map((e, i) => (
                    <li key={i}>
                      {e.commande} — {e.raison}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="mt-1 text-xs leading-5 text-ink-soft">
                Aucun refus. Vérifiez dans MikHmon que les tickets, les rapports et le revenu
                s’affichent.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
