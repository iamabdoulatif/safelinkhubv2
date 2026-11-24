/**
 * Règles des sites (agences) — fonctions PURES, testables sans base. Les
 * actions serveur lisent l'état et appliquent ces verdicts.
 */
export type Verdict = { ok: true } | { ok: false; error: string };

const OK = { ok: true } as const;

/**
 * Normalise un code de site : MAJUSCULES, lettres/chiffres/tiret, tirets
 * fondus. Dérivé du nom quand l'opérateur n'en saisit pas. Déterministe pour
 * que l'unicité (org_id, code) se vérifie côté base sans surprise.
 */
export function normalizeSiteCode(raw: string): string {
  return raw
    .trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "") // « Siège » → « Siege », pas « Si-ge »
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

/**
 * Création d'un site : nom non vide, code dérivable et non vide. Renvoie les
 * valeurs nettoyées pour que l'action n'ait rien à re-normaliser.
 */
export function guardCreateSite(params: {
  name: string;
  code: string;
}): Verdict & { name?: string; code?: string } {
  const name = params.name.trim();
  if (!name) return { ok: false, error: "Le nom du site est requis." };

  // Code saisi sinon dérivé du nom — un nom purement non-alphanumérique ne
  // produit aucun code exploitable, on le refuse plutôt que de poser "" en base.
  const code = normalizeSiteCode(params.code.trim() || name);
  if (!code) {
    return { ok: false, error: "Le code du site doit contenir au moins une lettre ou un chiffre." };
  }
  return { ok: true, name, code };
}

/** Affectation d'un routeur à un site : les deux doivent être dans l'org. */
export function guardAssignRouter(params: {
  routerOrgId: string | null;
  siteOrgId: string | null;
  sessionOrgId: string;
}): Verdict {
  if (params.routerOrgId !== params.sessionOrgId) {
    return { ok: false, error: "Routeur introuvable." };
  }
  if (params.siteOrgId !== params.sessionOrgId) {
    return { ok: false, error: "Site introuvable." };
  }
  return OK;
}
