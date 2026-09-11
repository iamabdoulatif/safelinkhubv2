export const CLOUD_MIKHMON_PORT_START = 20_000;
export const CLOUD_MIKHMON_PORT_END = 20_999;

const CLOUD_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const CLOUD_BASE_DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function routerCloudSlug(name: string, routerId: string): string {
  const label =
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 36) || "router";
  const suffix = routerId.replace(/-/g, "").toLowerCase().slice(-8);
  if (!/^[a-z0-9]{8}$/.test(suffix)) {
    throw new Error("Router id cannot produce a safe cloud domain suffix.");
  }
  return `${label}-${suffix}`;
}

export function cloudMikhmonDomain(slug: string, baseDomain: string): string {
  const cleanSlug = slug.trim().toLowerCase();
  const cleanBase = baseDomain.trim().toLowerCase();
  if (!CLOUD_LABEL.test(cleanSlug)) {
    throw new Error("Cloud MikHmon domain slug is invalid.");
  }
  if (!CLOUD_BASE_DOMAIN.test(cleanBase)) {
    throw new Error("Cloud MikHmon base domain is invalid.");
  }
  return `${cleanSlug}.${cleanBase}`;
}

export function cloudMikhmonPort(usedPorts: readonly number[]): number {
  const used = new Set(usedPorts);
  for (let port = CLOUD_MIKHMON_PORT_START; port <= CLOUD_MIKHMON_PORT_END; port++) {
    if (!used.has(port)) return port;
  }
  throw new Error("No private port is available for a cloud MikHmon instance.");
}

/**
 * Ports de la plage cloud RÉELLEMENT tenus par Docker sur le relais, lus dans
 * la sortie de `docker ps -a --format '{{.Ports}}'` (une ligne par conteneur,
 * de la forme « 127.0.0.1:20001->80/tcp », vide pour un conteneur sans
 * publication).
 *
 * La base ne suffit pas à savoir quel port est libre : un conteneur peut lui
 * survivre — routeur supprimé pendant que le relais était injoignable, ou
 * instance d'avant le nettoyage à la suppression. Il tient alors son port sans
 * plus aucune ligne pour le dire, et l'allocateur, qui ne lisait que la base,
 * le redistribuait : « Bind for 127.0.0.1:20001 failed: port is already
 * allocated », relevé sur HSPT-BELIKORO. Docker est la vérité sur ce point ;
 * on lui demande.
 */
export function parseBoundCloudPorts(dockerPsPorts: string): number[] {
  const ports = new Set<number>();
  // « hôte:PORT->conteneur » : seul le port HÔTE est suivi de « -> ». Un
  // conteneur publié en double (IPv4 et [::]) répète le même port, d'où le Set.
  for (const m of dockerPsPorts.matchAll(/:(\d+)->/g)) {
    const port = Number(m[1]);
    if (port >= CLOUD_MIKHMON_PORT_START && port <= CLOUD_MIKHMON_PORT_END) ports.add(port);
  }
  return [...ports];
}

/**
 * Étiquettes réservées sous le domaine MikHmon.
 *
 * Le certificat joker couvre *.mikhmon.safelinkhub.io, donc n'importe quelle
 * étiquette FONCTIONNERAIT techniquement. Ce n'est pas la question : un client
 * qui s'attribue « admin » ou « support » se donne une adresse dont l'autorité
 * n'est pas la sienne, et qui servira un jour à hameçonner ses propres agents.
 */
export const RESERVED_CLOUD_LABELS = new Set([
  "admin", "administrateur", "api", "app", "auth", "billing", "cdn", "dashboard",
  "dev", "ftp", "help", "login", "mail", "mx", "ns", "ns1", "ns2", "paiement",
  "pay", "portal", "root", "safelinkhub", "secure", "smtp", "staging", "support",
  "test", "www", "s1", "s2", "s3", "s4",
]);

/** Bornes de l'étiquette choisie. 63 est la limite DNS ; 3 évite les adresses illisibles. */
export const CLOUD_SLUG_MIN = 3;
export const CLOUD_SLUG_MAX = 40;

export type SlugVerdict = { ok: true; slug: string } | { ok: false; erreur: string };

/**
 * Valide une étiquette choisie par l'exploitant.
 *
 * ATTENTION — CE QUE CETTE FONCTION NE FAIT PAS : garantir l'unicité. Le slug
 * généré porte les 8 derniers caractères de l'identifiant du routeur, donc il
 * ne peut pas entrer en collision ; une étiquette libre, si. L'unicité se
 * vérifie en base (colonne `domain`, unique) AVANT de provisionner — la
 * contrainte rattraperait la course, mais avec une erreur Postgres brute que
 * personne ne saurait lire.
 */
export function normalizeCustomSlug(raw: string | null | undefined): SlugVerdict {
  const slug = (raw ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();

  if (!slug) return { ok: false, erreur: "Choisissez un sous-domaine." };
  if (slug.length < CLOUD_SLUG_MIN) {
    return { ok: false, erreur: `Trop court : ${CLOUD_SLUG_MIN} caractères au minimum.` };
  }
  if (slug.length > CLOUD_SLUG_MAX) {
    return { ok: false, erreur: `Trop long : ${CLOUD_SLUG_MAX} caractères au maximum.` };
  }
  if (!CLOUD_LABEL.test(slug)) {
    return {
      ok: false,
      erreur: "Lettres, chiffres et tirets uniquement, sans tiret au début ni à la fin.",
    };
  }
  /* Deux tirets d'affilée ouvrent la forme « xn-- » des noms internationalisés :
     un navigateur peut alors afficher l'adresse en caractères non latins, ce
     qui est exactement le matériau d'une adresse trompeuse. */
  if (slug.includes("--")) {
    return { ok: false, erreur: "Deux tirets consécutifs ne sont pas autorisés." };
  }
  if (RESERVED_CLOUD_LABELS.has(slug)) {
    return { ok: false, erreur: `« ${slug} » est réservé. Choisissez un autre sous-domaine.` };
  }
  return { ok: true, slug };
}

/** Préfixe des conteneurs MikHmon cloud sur le relais. Le reste du nom est
 *  l'identifiant du routeur, tirets retirés — voir containerNameFor(). */
export const CLOUD_CONTAINER_PREFIX = "slh-mikhmon-";

/**
 * Identifiant du routeur porté par un nom de conteneur, ou null si le nom
 * n'est pas l'un des nôtres. Inverse exact de containerNameFor() : un UUID
 * v4 sans ses tirets fait 32 hexadécimaux, qu'on redécoupe en 8-4-4-4-12.
 */
export function routerIdFromContainerName(name: string): string | null {
  if (!name.startsWith(CLOUD_CONTAINER_PREFIX)) return null;
  const h = name.slice(CLOUD_CONTAINER_PREFIX.length);
  if (!/^[0-9a-f]{32}$/.test(h)) return null;
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Parmi des noms de conteneurs du relais, ceux qui n'appartiennent à AUCUN
 * routeur existant — donc à retirer.
 *
 * Le critère est l'existence du ROUTEUR, pas celle de la ligne d'instance : un
 * conteneur sans ligne peut être une provision en cours (la ligne n'est écrite
 * qu'à la fin), ou une instance arrêtée. Seul un conteneur dont le routeur a
 * disparu de la plateforme ne peut être que du déchet. Les noms qui ne sont
 * pas les nôtres sont ignorés : on ne touche jamais à un conteneur qu'on n'a
 * pas créé.
 */
export function orphanCloudContainers(
  containerNames: readonly string[],
  liveRouterIds: ReadonlySet<string>,
): string[] {
  return containerNames.filter((name) => {
    const id = routerIdFromContainerName(name.trim());
    return id !== null && !liveRouterIds.has(id);
  });
}
