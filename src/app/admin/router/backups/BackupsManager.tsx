"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, RotateCcw, Trash2, AlertTriangle, ScanLine, Loader2, ChevronDown } from "lucide-react";
import { buttonClass } from "@/components/ui/Button";
import {
  startBackupJob,
  restoreBackup,
  startRestoreJob,
  getRestoreJob,
  cancelRestoreJob,
  deleteBackup,
  scanTargetForRestore,
} from "@/lib/mikrotik/backup-actions";
import RestoreTopology from "./RestoreTopology";
import RestoreLive, { type LiveProgress, type LiveStatus } from "./RestoreLive";
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
  removed?: number;
  failed: { name: string; error: string }[];
};
type Plan = {
  identity: { from: string | null; to: string | null; willApply: boolean };
  wifi: { ssid: string | null; sourceApi: string | null; targetApi: string; radios: string[]; translated: boolean };
  ports: { source: number; target: number; delta: number };
  mikhmon: { sourceLabel: string | null; targetLabel: string };
  data: { tickets: number; profiles: number; walledGarden: number };
  /** Peut manquer sur un job lancé avant cette version. */
  hotspot?: { server: string | null; addressPool: string | null; validated: boolean };
  blockers: string[];
  adjustments: string[];
};

const SECTION_LABELS: Record<string, string> = {
  purgeTarget: "vidage du routeur cible (remplacer)",
  hotspotUsers: "tickets",
  hotspotUserProfiles: "profils",
  hotspotUserProfileLinks: "liens ticket → profil",
  hotspotTargetBindings: "liaisons serveur et pool des profils",
  hotspotRestoreVerification: "vérification des tickets et profils",
  activeSessionHandover: "reprise des sessions actives et des cookies",
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
  // « Remplacer » : vider les profils, tickets et cookies de la cible avant de
  // reposer la sauvegarde — pour un rechange qui prend la place d'un routeur
  // défaillant, dont les anciens tickets n'ont plus de client.
  const [purge, setPurge] = useState<Record<string, boolean>>({});
  // Panneau de restauration déplié (un seul à la fois) et filtre par routeur.
  const [openId, setOpenId] = useState<string | null>(null);
  const [routerFilter, setRouterFilter] = useState("");
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [reports, setReports] = useState<{
    backupId: string;
    dryRun: boolean;
    outcome: "planned" | "done" | "failed";
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
  // Tableau de bord vivant (RestoreLive) : dernier avancement sondé, conservé
  // après la fin pour laisser les chiffres finaux à l'écran.
  const [live, setLive] = useState<{
    backupId: string;
    targetRouterId: string;
    status: LiveStatus;
    progress: LiveProgress | null;
    startedAt: number;
  } | null>(
    initialJob
      ? { backupId: initialJob.backupId, targetRouterId: initialJob.targetRouterId, status: "running", progress: null, startedAt: Date.now() }
      : null,
  );

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
        setLive((l) => (l ? { ...l, status: "error" } : l));
        setFeedback({
          kind: "err",
          text: (res && "error" in res && res.error) || "Suivi de la restauration impossible.",
        });
        stop();
        return;
      }
      if ("stale" in res && res.stale) {
        setLive((l) => (l ? { ...l, status: "error" } : l));
        setFeedback({
          kind: "err",
          text: "Restauration interrompue (le serveur a redémarré). Relancez-la : les tickets seront réalignés sur la sauvegarde.",
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

      const liveStatus: LiveStatus =
        res.status === "running" || res.status === "done" || res.status === "cancelled" ? res.status : "error";
      setLive((l) => (l ? { ...l, status: liveStatus, progress: progress as LiveProgress | null } : l));

      if (res.status === "running") {
        setJobProgress({ done: progress?.ticketsDone, total: progress?.ticketsTotal });
        // Les salves partent toutes les ~1 s : sonder plus vite ne montrerait rien de plus.
        timer = setTimeout(poll, 1500);
        return;
      }

      // État terminal (done | error).
      if (res.status === "done") {
        setReports({
          backupId: activeJob.backupId,
          dryRun: false,
          outcome: "done",
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
      } else if (res.status === "cancelled") {
        setReports({
          backupId: activeJob.backupId,
          dryRun: false,
          outcome: "failed",
          rows: (progress?.reports ?? []) as Report[],
          plan: (progress?.plan ?? null) as Plan | null,
        });
        setFeedback({ kind: "err", text: res.error ?? "Restauration annulée." });
      } else {
        if (progress?.plan) {
          setReports({
            backupId: activeJob.backupId,
            dryRun: false,
            outcome: "failed",
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
      // Tâche de fond + sondage (voir startBackupJob) : lire un millier de
      // tickets sur un routeur chargé dépasse la coupure ~100 s de Cloudflare.
      const start = await startBackupJob(sourceRouter);
      if (!start || !("jobId" in start) || !start.jobId) {
        setFeedback({ kind: "err", text: (start && "error" in start && start.error) || "Sauvegarde impossible." });
        return;
      }
      const jobId = start.jobId;
      for (;;) {
        await new Promise((r) => setTimeout(r, 2500));
        const res = await getRestoreJob(jobId);
        if (!res || ("error" in res && res.error)) {
          setFeedback({ kind: "err", text: (res && "error" in res && res.error) || "Suivi de la sauvegarde impossible." });
          return;
        }
        if (res.status === "running" && !res.stale) continue;
        if (res.status !== "done") {
          setFeedback({ kind: "err", text: res.error ?? "Sauvegarde interrompue (le serveur a redémarré). Relancez-la." });
          return;
        }
        const backup = (res.progress as { backup?: { counts?: Record<string, number>; warnings?: string[]; compressedBytes?: number } } | null)?.backup;
        const t = backup?.counts?.hotspotUsers ?? 0;
        const base = `Sauvegarde créée : ${t} ticket(s), ${backup?.counts?.hotspotUserProfiles ?? 0} profil(s) — ${formatSize(backup?.compressedBytes ?? 0)} compressés.`;
        // Une section illisible ne fait pas échouer la capture, mais la taire
        // ferait passer une sauvegarde amputée pour complète.
        const warnings = backup?.warnings ?? [];
        setFeedback(
          warnings.length > 0
            ? { kind: "err", text: `${base} Sections incomplètes : ${warnings.join(" ; ")}` }
            : { kind: "ok", text: base },
        );
        navRouter.refresh();
        return;
      }
    });
  }

  function runRestore(backup: Backup, dryRun: boolean) {
    const targetId = target[backup.id];
    if (!targetId || pending || activeJob) return;
    setFeedback(null);
    setReports(null);
    setLive(null);

    // Restauration RÉELLE → job de fond + sondage. Le clic répond en quelques
    // millisecondes ; l'écriture des milliers de tickets se poursuit côté serveur
    // hors de toute requête HTTP (sinon Cloudflare couperait à ~100 s).
    if (!dryRun) {
      if (
        purge[backup.id] &&
        !window.confirm(
          "Remplacer : TOUS les tickets, profils, sessions et cookies actuels du routeur cible seront supprimés avant la restauration, puis l'ancien routeur sera marqué « remplacé » dans le parc. Continuer ?",
        )
      ) {
        return;
      }
      startTransition(async () => {
        const res = await startRestoreJob(backup.id, targetId, !!purge[backup.id]);
        if (res && "error" in res && res.error) {
          // Un refus immédiat (déjà un job en cours) ne crée pas de sondage.
          setFeedback({ kind: "err", text: res.error });
          return;
        }
        if (res && "success" in res && res.jobId) {
          setJobProgress(null);
          setLive({ backupId: backup.id, targetRouterId: targetId, status: "running", progress: null, startedAt: Date.now() });
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
      const res = await restoreBackup(backup.id, targetId, true, !!purge[backup.id]);
      if (res && "error" in res && res.error) {
        // Un refus pour blocage rapporte quand même le plan : c'est lui qui dit
        // ce qu'il faut corriger sur le rechange avant de réessayer.
        if ("plan" in res && res.plan) {
          setReports({
            backupId: backup.id,
            dryRun: true,
            outcome: "failed",
            rows: [],
            plan: res.plan as Plan,
          });
        }
        setFeedback({ kind: "err", text: res.error });
        return;
      }
      if (res && "success" in res && res.success) {
        setReports({
          backupId: backup.id,
          dryRun: true,
          outcome: "planned",
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

  function cancelActive() {
    if (!activeJob) return;
    if (!window.confirm("Arrêter la restauration ? Ce qui est déjà écrit reste sur le rechange ; un nouveau passage le réalignera.")) return;
    startTransition(async () => {
      const res = await cancelRestoreJob(activeJob.jobId);
      if (res && "error" in res && res.error) setFeedback({ kind: "err", text: res.error });
      else setFeedback({ kind: "ok", text: "Annulation demandée — la restauration s'arrête au prochain tick (quelques secondes)." });
    });
  }

  function runScan(backup: Backup) {
    const targetId = target[backup.id];
    if (!targetId || busy) return;
    setFeedback(null);
    setReports(null);
    setLive(null);
    startTransition(async () => {
      const res = await scanTargetForRestore(backup.id, targetId);
      if (res && "error" in res && res.error) {
        setFeedback({ kind: "err", text: res.error });
        return;
      }
      if (res && "success" in res && res.success) {
        const plan = res.plan as Plan;
        setReports({ backupId: backup.id, dryRun: true, outcome: "planned", rows: [], plan });
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

  // Un seul panneau de restauration ouvert à la fois ; celui d'une
  // restauration en cours (ou de son rapport) reste ouvert d'office.
  const ouvert = (id: string) =>
    openId === id || live?.backupId === id || activeJob?.backupId === id || reports?.backupId === id;
  // Une sauvegarde de routeur supprimé n'a plus d'identifiant : clé à part.
  const cleRouteur = (b: { routerId: string | null }) => b.routerId ?? "__supprime";
  const routeursSauvegardes = Array.from(new Map(backups.map((b) => [cleRouteur(b), b.routerName])));
  const visibles = routerFilter ? backups.filter((b) => cleRouteur(b) === routerFilter) : backups;
  const fmtDate = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="space-y-5">
      {/* Sauvegarde manuelle : l'action courante, en tête. */}
      <section className="rounded-xl border border-line bg-paper p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label htmlFor="backup-source" className="mb-1.5 block text-[13px] font-medium text-ink">
              Sauvegarder un routeur maintenant
            </label>
            <select
              id="backup-source"
              value={sourceRouter}
              onChange={(e) => setSourceRouter(e.target.value)}
              className="field"
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
            className={buttonClass({ variant: "secondary" })}
          >
            {pending ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Save aria-hidden="true" className="h-4 w-4" />}
            {pending ? "En cours…" : "Sauvegarder maintenant"}
          </button>
        </div>
        <p className="mt-2 text-xs text-ink-soft">
          Lire plusieurs milliers de tickets charge le routeur quelques secondes (100 % de CPU sur
          un RB951) : en pleine journée, le portail peut ralentir brièvement.
        </p>
        {feedback && (
          <p
            role="status"
            className={`mt-3 rounded-lg px-3 py-2 text-sm ${
              feedback.kind === "ok" ? "bg-ok-soft text-ok" : "bg-err-soft text-err"
            }`}
          >
            {feedback.text}
          </p>
        )}
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-ink">Sauvegardes disponibles</h2>
            <p className="text-[13px] text-ink-soft">
              {backups.length} sauvegarde{backups.length > 1 ? "s" : ""} · les plus récentes en premier
            </p>
          </div>
          {routeursSauvegardes.length > 1 && (
            <div>
              <label htmlFor="backup-filter" className="sr-only">
                Filtrer par routeur
              </label>
              <select
                id="backup-filter"
                value={routerFilter}
                onChange={(e) => setRouterFilter(e.target.value)}
                className="field h-9 w-auto min-w-48 text-[13px] sm:h-9"
              >
                <option value="">Tous les routeurs</option>
                {routeursSauvegardes.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {backups.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong/50 bg-paper px-4 py-8 text-center text-sm text-ink-soft">
            Aucune sauvegarde pour l&apos;instant — lancez-en une, ou attendez la capture
            automatique de cette nuit (02:30).
          </p>
        ) : (
          <ul role="list" className="divide-y divide-line-soft overflow-hidden rounded-xl border border-line bg-paper">
            {visibles.map((b) => {
              const contenu =
                Object.entries(SECTION_LABELS)
                  .filter(([k]) => (b.counts[k] ?? 0) > 0)
                  .map(([k, label]) => `${b.counts[k]} ${label}`)
                  .join(" · ") || "aucune donnée restaurable";
              const estOuvert = ouvert(b.id);
              return (
                <li key={b.id} className={estOuvert ? "bg-clay/40" : undefined}>
                  <div className="grid gap-2 px-4 py-3.5 sm:px-5 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_auto] md:items-center md:gap-5">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink">{b.routerName}</p>
                      <p className="truncate text-xs text-ink-soft">
                        {[b.model, b.rosVersion && `RouterOS ${b.rosVersion}`].filter(Boolean).join(" · ") || "—"}
                      </p>
                      {b.orphan && (
                        <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-warn-soft px-2 py-0.5 text-xs font-semibold text-warn">
                          <AlertTriangle aria-hidden="true" className="h-3 w-3" />
                          routeur supprimé — sauvegarde conservée
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 text-[13px]">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-ink">
                        <span className="tabular-nums">{fmtDate.format(new Date(b.createdAt))}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            b.trigger === "auto" ? "bg-line-soft text-ink-soft" : "bg-info-soft text-info"
                          }`}
                        >
                          {b.trigger === "auto" ? "Auto" : "Manuelle"}
                        </span>
                        <span className="text-xs text-ink-soft">{formatSize(b.sizeBytes)}</span>
                      </p>
                      <p className="mt-0.5 truncate text-xs text-ink-soft" title={contenu}>
                        {contenu}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 md:justify-end">
                      <button
                        type="button"
                        onClick={() => setOpenId(estOuvert && openId === b.id ? null : b.id)}
                        aria-expanded={estOuvert}
                        className={buttonClass({ variant: "outline", size: "sm" })}
                      >
                        <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
                        Restaurer…
                        <ChevronDown
                          aria-hidden="true"
                          className={`h-3.5 w-3.5 transition-transform ${estOuvert ? "rotate-180" : ""}`}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(b.id)}
                        disabled={busy}
                        aria-label={`Supprimer la sauvegarde de ${b.routerName} du ${fmtDate.format(new Date(b.createdAt))}`}
                        className="btn btn-sm btn-ghost w-8 px-0 text-ink-soft hover:text-err"
                      >
                        <Trash2 aria-hidden="true" className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {estOuvert && (
                    <div className="border-t border-line-soft px-4 pb-5 pt-4 sm:px-5">
                      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                        <div>
                          <label htmlFor={`target-${b.id}`} className="mb-1.5 block text-[13px] font-medium text-ink">
                            Restaurer vers
                          </label>
                          <select
                            id={`target-${b.id}`}
                            value={target[b.id] ?? ""}
                            onChange={(e) => setTarget((t) => ({ ...t, [b.id]: e.target.value }))}
                            className="field"
                          >
                            <option value="">Choisir le routeur cible…</option>
                            {routers.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name}
                                {r.id === b.routerId ? " (routeur d'origine)" : ""}
                                {r.status === "online" ? "" : ` — ${r.status}`}
                              </option>
                            ))}
                          </select>
                        </div>
                        {/* Du plus prudent au plus engageant : lire, simuler, écrire. */}
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => runScan(b)}
                            disabled={busy || !target[b.id]}
                            title="Lit le matériel du rechange (interfaces, WiFi, stockage) sans rien écrire"
                            className={buttonClass({ variant: "ghost" })}
                          >
                            <ScanLine aria-hidden="true" className="h-4 w-4" />
                            Scanner
                          </button>
                          <button
                            type="button"
                            onClick={() => runRestore(b, true)}
                            disabled={busy || !target[b.id]}
                            className={buttonClass({ variant: "outline" })}
                          >
                            Simuler
                          </button>
                          <button
                            type="button"
                            onClick={() => runRestore(b, false)}
                            disabled={busy || !target[b.id]}
                            className={buttonClass({ variant: "primary" })}
                          >
                            {activeJob?.backupId === b.id ? (
                              <>
                                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                                {jobProgress?.total
                                  ? `Tickets ${jobProgress.done ?? 0}/${jobProgress.total}`
                                  : "Restauration…"}
                              </>
                            ) : (
                              <>
                                <RotateCcw aria-hidden="true" className="h-4 w-4" />
                                Restaurer
                              </>
                            )}
                          </button>
                          {activeJob?.backupId === b.id && (
                            <button type="button" onClick={cancelActive} disabled={pending} className={buttonClass({ variant: "outline" })}>
                              Annuler
                            </button>
                          )}
                        </div>
                      </div>

                      <label className="mt-3 flex items-start gap-2 text-[13px] text-ink-soft">
                        <input
                          type="checkbox"
                          checked={!!purge[b.id]}
                          onChange={(e) => setPurge((p) => ({ ...p, [b.id]: e.target.checked }))}
                          disabled={busy}
                          className="mt-0.5 h-4 w-4 accent-[var(--slate-deep)]"
                        />
                        <span>
                          <strong className="font-semibold text-ink">Remplacer</strong> : vider d&apos;abord
                          les tickets, profils et cookies du routeur cible, puis marquer l&apos;ancien
                          routeur « remplacé ». Sans cette case, les tickets sont fusionnés (rien
                          n&apos;est écrasé).
                        </span>
                      </label>

                      {live?.backupId === b.id ? (
                        <RestoreLive
                          source={{ name: b.routerName, model: b.model }}
                          target={routers.find((r) => r.id === live.targetRouterId) ?? { name: "?", model: null }}
                          counts={b.counts}
                          progress={live.progress}
                          status={live.status}
                          startedAt={live.startedAt}
                          onCancel={cancelActive}
                          cancelling={pending}
                        />
                      ) : (
                        target[b.id] && (
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
                              reports?.backupId === b.id && !reports.dryRun
                                ? reports.outcome === "done"
                                  ? "done"
                                  : "failed"
                                : reports?.backupId === b.id && reports.plan
                                  ? "planned"
                                  : "idle",
                            )}
                            flowing={flowing === b.id}
                            blocked={reports?.backupId === b.id && (reports.plan?.blockers.length ?? 0) > 0}
                            failed={reports?.backupId === b.id && reports.outcome === "failed"}
                          />
                        )
                      )}

                      {reports?.backupId === b.id && (
                        <div className="mt-3 rounded-xl border border-line bg-paper p-4">
                          <p className="text-[13px] font-semibold text-ink">
                            {reports.dryRun
                              ? "Simulation — aucune écriture"
                              : reports.outcome === "failed"
                                ? "Restauration interrompue — corrections requises"
                                : "Résultat de la restauration"}
                          </p>

                          {reports.plan && (
                            <div className="mb-2 mt-1 border-b border-line-soft pb-2">
                              <p className="text-xs text-ink-soft">
                                {reports.plan.identity.from ?? "?"} → {reports.plan.identity.to ?? "?"}
                                {reports.plan.wifi.targetApi !== "none" && (
                                  <span className="ml-1">
                                    · WiFi {reports.plan.wifi.sourceApi ?? "?"} → {reports.plan.wifi.targetApi}
                                    {reports.plan.wifi.radios.length > 0 && ` (${reports.plan.wifi.radios.join(", ")})`}
                                  </span>
                                )}
                                {reports.plan.mikhmon.sourceLabel && (
                                  <span className="ml-1">
                                    · MikHmon {reports.plan.mikhmon.sourceLabel} → {reports.plan.mikhmon.targetLabel}
                                  </span>
                                )}
                                {reports.plan.hotspot?.validated && (
                                  <span className="ml-1">
                                    · HotSpot {reports.plan.hotspot.server} → pool {reports.plan.hotspot.addressPool}
                                  </span>
                                )}
                              </p>
                              {reports.plan.blockers.map((bl) => (
                                <p key={bl} className="mt-1 flex items-start gap-1.5 text-xs font-medium text-err">
                                  <AlertTriangle aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0" />
                                  {bl}
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
                              {SECTION_LABELS[r.section] ?? r.section} :{" "}
                              {r.section === "purgeTarget" ? (
                                <>{r.removed ?? 0} élément(s) retiré(s) de la cible (sessions, cookies, tickets, profils, balayages)</>
                              ) : (
                                <>
                                  {r.created} créé(s), {r.skipped} déjà présent(s)
                                  {r.updated > 0 && <>, {r.updated} réaligné(s) sur la sauvegarde</>}
                                </>
                              )}
                              {r.failed.length > 0 && <span className="text-err">, {r.failed.length} en échec</span>}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
