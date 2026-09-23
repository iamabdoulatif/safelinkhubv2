import { getRestoreJob } from "@/lib/mikrotik/backup-actions";

/**
 * Suit un job d'auto-setup (router_restore_jobs, phase "autosetup") jusqu'à
 * sa fin, par requêtes brèves — loin des ~100 s au-delà desquelles Cloudflare
 * coupe une réponse. Partagé par l'étape 4 de l'assistant et par la
 * réparation « Continuer l'auto-setup » du bandeau d'audit.
 */

const POLL_MS = 2000;
// Coupures réseau tolérées d'affilée avant d'avouer qu'on ne sait plus rien.
const MAX_FAILURES = 15;

export type JobOutcome<R> =
  | { kind: "done"; result: R | null; error: string | null }
  | { kind: "stale" }
  | { kind: "lost" }
  | { kind: "cancelled" };

export async function followAutoSetupJob<R>(
  jobId: string,
  {
    onStep,
    isCancelled = () => false,
    wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
  }: {
    onStep?: (step: string) => void;
    isCancelled?: () => boolean;
    wait?: (ms: number) => Promise<void>;
  } = {},
): Promise<JobOutcome<R>> {
  let failures = 0;
  for (;;) {
    await wait(POLL_MS);
    if (isCancelled()) return { kind: "cancelled" };
    const job = await getRestoreJob(jobId).catch(() => null);
    if (isCancelled()) return { kind: "cancelled" };
    if (!job || !("success" in job)) {
      if (++failures >= MAX_FAILURES) return { kind: "lost" };
      continue;
    }
    failures = 0;
    const progress = job.progress as { step?: string; result?: R } | null;
    if (job.status === "running") {
      if (job.stale) return { kind: "stale" };
      if (progress?.step) onStep?.(progress.step);
      continue;
    }
    return { kind: "done", result: progress?.result ?? null, error: job.error };
  }
}

export const JOB_LOST_MESSAGE =
  "Suivi de l'installation perdu (connexion instable). Le routeur a peut-être été configuré : relisez son état avant de relancer.";
export const JOB_STALE_MESSAGE =
  "Le serveur a redémarré pendant l'installation. Relancez-la : elle reprend là où le routeur en est, sans nouvelle facturation.";
