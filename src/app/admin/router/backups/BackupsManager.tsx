"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, RotateCcw, Trash2, AlertTriangle, ScanLine, Loader2 } from "lucide-react";
import {
  backupRouterNow,
  restoreBackup,
  startRestoreJob,
  getRestoreJob,
  deleteBackup,
  scanTargetForRestore,
} from "@/lib/mikrotik/backup-actions";
import RestoreTopology from "./RestoreTopology";
import {
  buildTopologyChannels,
  sourceNode,
  targetNode,
  type PlanLike,
} from "./restore-topology-model";

type Backup = {
  id: string;
  routerId: string | null;
  routerName: string;
  model: string | null;
  rosVersion: string | null;
  trigger: string;
  sizeBytes: number;
  counts: Record<string, number>;
  createdAt: string;
  orphan: boolean;
};
type RouterOption = { id: string; name: string; status: string; model: string | null };

type Report = {
  section: string;
  created: number;
  skipped: number;
  updated: number;
  failed: { name: string; error: string }[];
};
type Plan = {
  identity: { from: string | null; to: string | null; willApply: boolean };
  wifi: { ssid: string | null; sourceApi: string | null; targetApi: string; radios: string[]; translated: boolean };
  ports: { source: number; target: number; delta: number };
  mikhmon: { sourceLabel: string | null; targetLabel: string };
  data: { tickets: number; profiles: number; walledGarden: number };
  blockers: string[];
  adjustments: string[];
};

const SECTION_LABELS: Record<string, string> = {
  hotspotUsers: "tickets",
  hotspotUserProfiles: "profils",
  mikhmonSchedulers: "expiration des tickets",
  mikhmonSales: "recettes MikHmon",
  walledGarden: "walled-garden",
  walledGardenIp: "walled-garden IP",
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1048576) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / 1048576).toFixed(1)} Mo`;
}

export default function BackupsManager({
  backups,
  routers,
  initialJob,
}: {
  backups: Backup[];
  routers: RouterOption[];
  // Job de restauration déjà en cours au chargement (voir page.tsx) : l'UI
  // reprend le suivi là où il en est, pour survivre à un rafraîchissement.
  initialJob?: { jobId: string; backupId: string; targetRouterId: string } | null;
}) {
  const navRouter = useRouter();
  const [pending, startTransition] = useTransition();
  const [sourceRouter, setSourceRouter] = useState(routers[0]?.id ?? "");
  const [target, setTarget] = useState<Record<string, string>>(
    initialJob ? { [initialJob.backupId]: initialJob.targetRouterId } : {},
  );
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [reports, setReports] = useState<{
    backupId: string;
    dryRun: boolean;
    rows: Report[];
    plan: Plan | null;
  } | null>(null);
  // Vrai UNIQUEMENT pendant une restauration réelle : les paquets ne circulent
  // pas pour une simulation, qui n'écrit rien.
  const [flowing, setFlowing] = useState<string | null>(initialJob?.backupId ?? null);
  // Une restauration réelle tourne désormais en tâche de fond (elle dure des
  // minutes, au-delà de la limite ~100 s de Cloudflare) : on garde l'id du job et
  // on interroge son avancement, plutôt que d'attendre une réponse synchrone qui
  // serait coupée en plein vol. Amorcé depuis initialJob si une restauration
  // était déjà en cours au chargement.
  const [activeJob, setActiveJob] = useState<{ backupId: string; jobId: string } | null>(
    initialJob ? { backupId: initialJob.backupId, jobId: initialJob.jobId } : null,
  );
  const [jobProgress, setJobProgress] = useState<{ done?: number; total?: number } | null>(null);

  // Sondage du job : chaque requête est brève (bien en deçà des 100 s), donc
  // jamais coupée. S'arrête au premier état terminal, ou si le heartbeat est figé
  // (conteneur redémarré → « stale »).
  useEffect(() => {
    if (!activeJob) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const stop = () => {
      setActiveJob(null);
      setFlowing(null);
      setJobProgress(null);
    };

    const poll = async () => {
      const res = await getRestoreJob(activeJob.jobId);
      if (cancelled) return;

      if (!res || ("error" in res && res.error)) {
        setFeedback({
          kind: "err",
          text: (res && "error" in res && res.error) || "Suivi de la restauration impossible.",
        });
        stop();
        return;
      }
      if ("stale" in res && res.stale) {
        setFeedback({
          kind: "err",
          text: "Restauration interrompue (le serveur a redémarré). Relancez-la : les tickets déjà restaurés seront ignorés.",
        });
        stop();
        navRouter.refresh();
        return;
      }

      const progress = (res.progress ?? null) as {
        reports?: Report[];
        plan?: Plan | null;
        ticketsDone?: number;
        ticketsTotal?: number;
        portal?: { installed: boolean; templateName?: string | null; error?: string };
      } | null;

      if (res.status === "running") {
        setJobProgress({ done: progress?.ticketsDone, total: progress?.ticketsTotal });
        timer = setTimeout(poll, 2500);
        return;
      }

      // État terminal (done | error).
      if (res.status === "done") {
        setReports({
          backupId: activeJob.backupId,
          dryRun: false,
          rows: (progress?.reports ?? []) as Report[],
          plan: (progress?.plan ?? null) as Plan | null,
        });
        const portal = progress?.portal;
        const portalKo = portal && portal.installed === false;
        setFeedback({
          kind: portalKo ? "err" : "ok",
          text: portalKo
            ? `Tickets restaurés, mais portail NON réinstallé : ${portal?.error ?? "erreur"}.`
            : "Restauration terminée.",
        });
      } else {
        if (progress?.plan) {
          setReports({
            backupId: activeJob.backupId,
            dryRun: false,
            rows: (progress?.reports ?? []) as Report[],
            plan: progress.plan as Plan,
          });
        }
        setFeedback({ kind: "err", text: res.error ?? "Restauration échouée." });
      }
      stop();
      navRouter.refresh();
    };

    timer = setTimeout(poll, 1500);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [activeJob, navRouter]);

  // Tout est verrouillé pendant qu'un job tourne : lancer une autre opération sur
  // le parc pendant une restauration en cours n'a pas de sens.
  const busy = pending || activeJob !== null;

  function runBackup() {
    if (!sourceRouter || busy) return;
    setFeedback(null);
    setReports(null);
    startTransition(async () => {
      const res = await backupRouterNow(sourceRouter);
      if (res && "error" in res && res.error) {
        setFeedback({ kind: "err", text: res.error });
        return;
      }
      if (res && "success" in res && res.success) {
        const t = res.counts?.hotspotUsers ?? 0;
        const base = `Sauvegarde créée : ${t} ticket(s), ${res.counts?.hotspotUserProfiles ?? 0} profil(s) — ${formatSize(res.compressedBytes ?? 0)} compressés.`;
        // Une section illisible ne fait pas échouer la capture, mais la taire
        // ferait passer une sauvegarde amputée pour complète.
        const warnings = res.warnings ?? [];
        setFeedback(
          warnings.length > 0
            ? { kind: "err", text: `${base} Sections incomplètes : ${warnings.join(" ; ")}` }
            : { kind: "ok", text: base },
        );
        navRouter.refresh();
      }
    });
  }

  function runRestore(backup: Backup, dryRun: boolean) {
    const targetId = target[backup.id];
    if (!targetId || pending || activeJob) return;
    setFeedback(null);
    setReports(null);

    // Restauration RÉELLE → job de fond + sondage. Le clic répond en quelques
    // millisecondes ; l'écriture des milliers de tickets se poursuit côté serveur
    // hors de toute requête HTTP (sinon Cloudflare couperait à ~100 s).
    if (!dryRun) {
      startTransition(async () => {
        const res = await startRestoreJob(backup.id, targetId);
        if (res && "error" in res && res.error) {
          // Un refus immédiat (déjà un job en cours) ne crée pas de sondage.
          setFeedback({ kind: "err", text: res.error });
          return;
        }
        if (res && "success" in res && res.jobId) {
          setJobProgress(null);
          setFlowing(backup.id);
          setActiveJob({ backupId: backup.id, jobId: res.jobId });
          setFeedback({
            kind: "ok",
            text: "Restauration lancée — elle se poursuit même si vous quittez cette page.",
          });
        }
      });
      return;
    }

    // Simulation (dryRun) : lecture brève, reste synchrone.
    startTransition(async () => {
      const res = await restoreBackup(backup.id, targetId, true);
      if (res && "error" in res && res.error) {
        // Un refus pour blocage rapporte quand même le plan : c'est lui qui dit
        // ce qu'il faut corriger sur le rechange avant de réessayer.
        if ("plan" in res && res.plan) {
          setReports({ backupId: backup.id, dryRun: true, rows: [], plan: res.plan as Plan });
        }
        setFeedback({ kind: "err", text: res.error });
        return;
      }
      if (res && "success" in res && res.success) {
        setReports({
          backupId: backup.id,
          dryRun: true,
          rows: res.reports as Report[],
          plan: (res.plan as Plan) ?? null,
        });
        setFeedback({
          kind: "ok",
          text: "Simulation terminée — rien n'a été écrit sur le routeur.",
        });
      }
    });
  }

  function runScan(backup: Backup) {
    const targetId = target[backup.id];
    if (!targetId || busy) return;
    setFeedback(null);
    setReports(null);
    startTransition(async () => {
      const res = await scanTargetForRestore(backup.id, targetId);
      if (res && "error" in res && res.error) {
        setFeedback({ kind: "err", text: res.error });
        return;
      }
      if (res && "success" in res && res.success) {
        const plan = res.plan as Plan;
        setReports({ backupId: backup.id, dryRun: true, rows: [], plan });
        setFeedback(
          plan.blockers.length > 0
            ? { kind: "err", text: "Ce rechange ne peut pas reprendre l'ancien en l'état — voir ci-dessous." }
            : { kind: "ok", text: "Rechange compatible : la sauvegarde peut y être restaurée." },
        );
      }
    });
  }

  function remove(id: string) {
    if (busy) return;
    startTransition(async () => {
      await deleteBackup(id);
      navRouter.refresh();
    });
  }

  return (
    <div className="mt-6">
      <div className="border-2 border-line bg-paper p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-ink">Routeur à sauvegarder</label>
            <select
              value={sourceRouter}
              onChange={(e) => setSourceRouter(e.target.value)}
              className="w-full rounded-md border border-line-soft px-3 py-2 text-sm focus:border-ok focus:outline-none"
            >
              {routers.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {r.status === "online" ? "" : ` — ${r.status}`}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={runBackup}
            disabled={busy || !sourceRouter}
            className="flex items-center justify-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-brand disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {pending ? "En cours…" : "Sauvegarder maintenant"}
          </button>
        </div>

        {feedback && (
          <p
            className={`mt-3 rounded-md px-3 py-2 text-sm ${
              feedback.kind === "ok" ? "bg-clay text-ok" : "bg-red-50 text-red-600"
            }`}
          >
            {feedback.text}
          </p>
        )}
      </div>

      {backups.length === 0 ? (
        <p className="mt-6 rounded-md border border-line-soft bg-clay px-3 py-2 text-sm text-ink-soft">
          Aucune sauvegarde pour l&apos;instant — lancez-en une, ou attendez la capture automatique
          de cette nuit.
        </p>
      ) : (
        <div className="mt-6 space-y-3">
          {backups.map((b) => (
            <div key={b.id} className="border-2 border-line bg-paper p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <span className="text-sm font-semibold text-ink">{b.routerName}</span>
                  {b.model && <span className="ml-2 text-xs text-ink-soft">{b.model}</span>}
                  {b.rosVersion && <span className="ml-2 text-xs text-ink-soft">RouterOS {b.rosVersion}</span>}
                  {b.orphan && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                      <AlertTriangle className="h-3 w-3" />
                      routeur supprimé — sauvegarde conservée
                    </span>
                  )}
                </div>
                <span className="text-xs text-ink-soft">
                  {new Date(b.createdAt).toLocaleString("fr-FR")} · {b.trigger === "auto" ? "auto" : "manuelle"} ·{" "}
                  {formatSize(b.sizeBytes)}
                </span>
              </div>

              <p className="mt-1 text-xs text-ink-soft">
                {Object.entries(SECTION_LABELS)
                  .filter(([k]) => (b.counts[k] ?? 0) > 0)
                  .map(([k, label]) => `${b.counts[k]} ${label}`)
                  .join(" · ") || "aucune donnée restaurable"}
              </p>

              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <select
                  value={target[b.id] ?? ""}
                  onChange={(e) => setTarget((t) => ({ ...t, [b.id]: e.target.value }))}
                  className="flex-1 rounded-md border border-line-soft px-3 py-2 text-sm focus:border-ok focus:outline-none"
                >
                  <option value="">Restaurer vers…</option>
                  {routers.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                      {r.id === b.routerId ? " (routeur d'origine)" : ""}
                      {r.status === "online" ? "" : ` — ${r.status}`}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => runScan(b)}
                  disabled={busy || !target[b.id]}
                  title="Lit le matériel du rechange (interfaces, WiFi, stockage) sans rien écrire"
                  className="flex items-center justify-center gap-2 rounded-md border border-line px-3 py-2 text-sm font-medium text-ink hover:border-ok disabled:opacity-60"
                >
                  <ScanLine className="h-4 w-4" />
                  Scanner
                </button>
                <button
                  type="button"
                  onClick={() => runRestore(b, true)}
                  disabled={busy || !target[b.id]}
                  className="rounded-md border border-line px-3 py-2 text-sm font-medium text-ink hover:border-ok disabled:opacity-60"
                >
                  Simuler
                </button>
                <button
                  type="button"
                  onClick={() => runRestore(b, false)}
                  disabled={busy || !target[b.id]}
                  className="flex items-center justify-center gap-2 rounded-md bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-brand disabled:opacity-60"
                >
                  {activeJob?.backupId === b.id ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {jobProgress?.total
                        ? `Restauration ${jobProgress.done ?? 0}/${jobProgress.total}`
                        : "Restauration…"}
                    </>
                  ) : (
                    <>
                      <RotateCcw className="h-4 w-4" />
                      Restaurer
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => remove(b.id)}
                  disabled={busy}
                  aria-label="Supprimer la sauvegarde"
                  className="rounded-md border border-line px-3 py-2 text-ink-soft hover:border-red-300 hover:text-red-600 disabled:opacity-60"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {target[b.id] && (
                <RestoreTopology
                  source={sourceNode(b)}
                  target={targetNode(
                    routers.find((r) => r.id === target[b.id]) ?? {
                      name: "?",
                      model: null,
                      status: "?",
                    },
                  )}
                  channels={buildTopologyChannels(
                    b,
                    reports?.backupId === b.id ? (reports.plan as PlanLike | null) : null,
                    reports?.backupId === b.id && !reports.dryRun && reports.rows.length > 0
                      ? "done"
                      : reports?.backupId === b.id && reports.plan
                        ? "planned"
                        : "idle",
                  )}
                  flowing={flowing === b.id}
                  blocked={
                    reports?.backupId === b.id && (reports.plan?.blockers.length ?? 0) > 0
                  }
                />
              )}

              {reports?.backupId === b.id && (
                <div className="mt-3 rounded-md border border-line-soft bg-clay p-3">
                  <p className="text-xs font-medium text-ink">
                    {reports.dryRun ? "Simulation — aucune écriture" : "Résultat de la restauration"}
                  </p>

                  {reports.plan && (
                    <div className="mb-2 mt-1 border-b border-line-soft pb-2">
                      <p className="text-xs text-ink-soft">
                        {reports.plan.identity.from ?? "?"} → {reports.plan.identity.to ?? "?"}
                        {reports.plan.wifi.targetApi !== "none" && (
                          <span className="ml-1">
                            · WiFi {reports.plan.wifi.sourceApi ?? "?"} → {reports.plan.wifi.targetApi}
                            {reports.plan.wifi.radios.length > 0 &&
                              ` (${reports.plan.wifi.radios.join(", ")})`}
                          </span>
                        )}
                        {reports.plan.mikhmon.sourceLabel && (
                          <span className="ml-1">
                            · MikHmon {reports.plan.mikhmon.sourceLabel} → {reports.plan.mikhmon.targetLabel}
                          </span>
                        )}
                      </p>
                      {reports.plan.blockers.map((b) => (
                        <p key={b} className="mt-1 text-xs font-medium text-red-600">
                          ⛔ {b}
                        </p>
                      ))}
                      {reports.plan.adjustments.map((a) => (
                        <p key={a} className="mt-0.5 text-xs text-ink-soft">
                          • {a}
                        </p>
                      ))}
                    </div>
                  )}

                  {reports.rows.map((r) => (
                    <p key={r.section} className="mt-1 text-xs text-ink-soft">
                      {SECTION_LABELS[r.section] ?? r.section} : {r.created} créé(s), {r.skipped} déjà
                      présent(s)
                      {r.updated > 0 && <>, {r.updated} réaligné(s) sur la sauvegarde</>}
                      {r.failed.length > 0 && (
                        <span className="text-red-600">, {r.failed.length} en échec</span>
                      )}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
