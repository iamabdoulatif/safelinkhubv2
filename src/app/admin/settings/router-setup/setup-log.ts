/**
 * Lecture du journal renvoyé par provisionHotspotStack.
 *
 * Le journal mélange des lignes « OK: … », « FAIL (étiquette): … » et
 * « SKIP (étiquette): … », en anglais comme en français. Affiché tel quel, il
 * noyait l'opérateur : quarante lignes techniques pour une seule qui compte.
 * L'écran d'installation n'en extrait donc que ce qui demande une action (les
 * échecs) et ce qui a été volontairement sauté ; le journal brut reste
 * disponible, replié, pour le support.
 */

export type SetupLogEntry = { label: string; message: string };

export type SetupLogSummary = {
  ok: number;
  failures: SetupLogEntry[];
  skipped: SetupLogEntry[];
};

const TAGGED = /^(FAIL|SKIP)\s*\(([^)]*)\)\s*:\s*(.*)$/;

export function summarizeSetupLog(log: readonly string[] | undefined): SetupLogSummary {
  const summary: SetupLogSummary = { ok: 0, failures: [], skipped: [] };
  for (const raw of log ?? []) {
    const line = raw.trim();
    if (line.startsWith("OK:")) {
      summary.ok += 1;
      continue;
    }
    const m = TAGGED.exec(line);
    if (!m) continue;
    const entry = { label: m[2].trim(), message: m[3].trim() };
    (m[1] === "FAIL" ? summary.failures : summary.skipped).push(entry);
  }
  return summary;
}

/** Durée écoulée « mm:ss », au-delà d'une heure « h:mm:ss ». */
export function formatElapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const pad = (n: number) => String(n).padStart(2, "0");
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}
