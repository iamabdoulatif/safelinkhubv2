/**
 * Garde-fou de la restauration BINAIRE (`/system backup load`).
 *
 * Une sauvegarde `.backup` est un clone complet : elle restaure jusqu'aux
 * adresses MAC et à l'identité. Elle ne doit donc jamais servir à migrer vers
 * un AUTRE routeur — ça, c'est le rôle de la sauvegarde SafeLinkHub (logique).
 *
 * En revanche, cet écran exigeait aussi la « MÊME version RouterOS », et c'est
 * FAUX : MikroTik restaure une sauvegarde sur une version PLUS RÉCENTE de la
 * même branche majeure — RouterOS migre la configuration au chargement. Le cas
 * courant (sauvegarde prise en 7.8, routeur depuis passé en 7.24) était donc
 * déclaré incompatible par le SaaS alors que le matériel l'accepte.
 *
 * Ce qui n'est réellement PAS pris en charge, et que ce module bloque :
 *   - franchir la version majeure (une sauvegarde v6 sur un routeur v7) ;
 *   - reculer (sauvegarde plus récente que le routeur) — le format n'est pas
 *     rétro-compatible, RouterOS refuse ou charge une configuration tronquée.
 *
 * La confirmation vérifiée ici l'est aussi côté serveur : un appel direct à la
 * Server Action ne doit pas pouvoir contourner l'interface.
 */

export type RouterOsVersion = { major: number; minor: number; patch: number };

/**
 * Lit « 7.24 », « 7.8.2 », « 6.49.10 (long-term) », « 7.24rc3 ».
 *
 * RouterOS accole le canal au numéro (`7.24beta4`) ou l'ajoute entre
 * parenthèses selon les menus : on s'arrête au premier caractère non numérique
 * plutôt que d'essayer de comprendre le suffixe, qui ne change pas la
 * compatibilité du format.
 */
export function parseRouterOsVersion(raw: string | null | undefined): RouterOsVersion | null {
  if (!raw) return null;
  const m = /(\d+)\.(\d+)(?:\.(\d+))?/.exec(String(raw).trim());
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: m[3] ? Number(m[3]) : 0 };
}

/** < 0 si a précède b, 0 si identiques, > 0 si a est postérieure. */
export function compareRouterOsVersions(a: RouterOsVersion, b: RouterOsVersion): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

export type VersionVerdict =
  | { kind: "ok"; message: string }
  | { kind: "unknown"; message: string }
  | { kind: "blocked"; message: string };

/**
 * Confronte la version d'ORIGINE de la sauvegarde à celle qui tourne
 * actuellement sur le routeur cible.
 *
 * `sourceVersion` est déclarée par l'opérateur : le format binaire de RouterOS
 * n'est pas documenté et n'expose pas son numéro de version de façon lisible —
 * inventer un analyseur d'octets pour cela serait une devinette déguisée en
 * vérification. Non renseignée, on n'invente rien : « unknown » laisse passer
 * en énonçant la règle.
 */
export function binaryBackupVersionVerdict(input: {
  sourceVersion?: string | null;
  targetVersion?: string | null;
}): VersionVerdict {
  const source = parseRouterOsVersion(input.sourceVersion);
  const target = parseRouterOsVersion(input.targetVersion);

  if (!source || !target) {
    return {
      kind: "unknown",
      message:
        "Version d'origine de la sauvegarde inconnue : la restauration se fait sur une version identique ou PLUS RÉCENTE de la même branche majeure. Une sauvegarde v6 sur un routeur v7, ou plus récente que le routeur, sera refusée par RouterOS.",
    };
  }

  if (source.major !== target.major) {
    return {
      kind: "blocked",
      message: `Sauvegarde RouterOS v${source.major} sur un routeur en v${target.major} : MikroTik ne prend pas en charge la restauration binaire d'une branche majeure à l'autre. Utilisez la restauration SafeLinkHub (logique), qui rejoue la configuration au lieu de la cloner.`,
    };
  }

  const ordre = compareRouterOsVersions(source, target);
  if (ordre > 0) {
    return {
      kind: "blocked",
      message: `La sauvegarde vient de RouterOS ${source.major}.${source.minor}.${source.patch}, plus récente que le routeur (${target.major}.${target.minor}.${target.patch}). Le format n'est pas rétro-compatible : mettez d'abord le routeur à jour, puis relancez la restauration.`,
    };
  }

  if (ordre === 0) {
    return { kind: "ok", message: "Sauvegarde et routeur sont sur la même version RouterOS." };
  }

  return {
    kind: "ok",
    message: `Sauvegarde prise en RouterOS ${source.major}.${source.minor}.${source.patch}, routeur en ${target.major}.${target.minor}.${target.patch} : c'est le sens pris en charge. RouterOS migre la configuration vers le format de la version installée pendant le chargement.`,
  };
}

export type BinaryRestoreGuardInput = {
  /** L'opérateur atteste qu'il s'agit du MÊME routeur physique. */
  sameDeviceConfirmed: boolean;
  /** Version RouterOS d'origine de la sauvegarde, déclarée (facultative). */
  sourceVersion?: string | null;
  /** Version lue en direct sur le routeur cible. */
  targetVersion?: string | null;
};

export function binaryBackupRestoreGuard(
  input: BinaryRestoreGuardInput,
): { ok: true; verdict: VersionVerdict } | { ok: false; error: string } {
  if (!input.sameDeviceConfirmed) {
    return {
      ok: false,
      error:
        "Restauration binaire bloquée : confirmez qu'il s'agit du MÊME routeur physique. Une sauvegarde binaire restaure aussi les adresses MAC et l'identité — pour migrer vers un autre MikroTik, utilisez la sauvegarde SafeLinkHub (logique).",
    };
  }

  const verdict = binaryBackupVersionVerdict(input);
  if (verdict.kind === "blocked") return { ok: false, error: verdict.message };
  return { ok: true, verdict };
}

/** Toute annulation ou nouvelle cible exige un acquittement frais. */
export function resetBinaryBackupRestoreConfirmation() {
  return {
    confirming: false,
    sameDeviceConfirmed: false,
  };
}

/**
 * `/system backup load` REDÉMARRE le routeur : la connexion API tombe, et
 * l'erreur qui remonte est donc ATTENDUE. Le code l'avalait entièrement
 * (`.catch(() => {})`) — un refus de RouterOS (« invalid backup file », mot de
 * passe faux, fichier corrompu) était alors annoncé comme une réussite, avec
 * un redémarrage qui n'a jamais lieu.
 *
 * On sait les distinguer : un refus arrive en `!trap`, la connexion reste
 * ouverte et le message vient de RouterOS. Un redémarrage, lui, coupe le
 * transport — délai dépassé, socket fermée, `!fatal`.
 */
const COUPURES_ATTENDUES = [
  "timed out",
  "closed by peer",
  "connection terminated",
  "econnreset",
  "epipe",
  "socket hang up",
  "not connected",
];

export function classifyBackupLoadOutcome(
  error: unknown,
): { rebooting: true } | { rebooting: false; routerMessage: string } {
  if (!error) return { rebooting: true };
  const message = error instanceof Error ? error.message : String(error);
  const bas = message.toLowerCase();
  if (COUPURES_ATTENDUES.some((motif) => bas.includes(motif))) return { rebooting: true };
  return { rebooting: false, routerMessage: message };
}
