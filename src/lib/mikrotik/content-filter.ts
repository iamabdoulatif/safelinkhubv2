/**
 * FILTRAGE DE CONTENU : couper l'adulte, les torrents, les paris et les sites
 * illicites sur un parc MikroTik — en RouterOS 6 COMME en RouterOS 7.
 *
 * Ce module ne parle pas au routeur : il construit un PLAN déclaratif (une
 * suite d'étapes RouterOS). Deux sorties en découlent, garanties identiques :
 *
 *   - `renderPlanScript(plan)`  → le script `.rsc` copier-coller (terminal,
 *                                 routeur hors ligne, injection manuelle) ;
 *   - `applyPlan(client, plan)` → la même chose via l'API RouterOS.
 *
 * Tout ce qui est posé porte le commentaire `safelinkhub-content-filter`, donc
 * la pose est IDEMPOTENTE (on purge par commentaire avant d'ajouter) et la
 * dépose est totale. Rien d'autre sur le routeur n'est touché.
 *
 * ─── Pourquoi le plan dépend de la version ──────────────────────────────────
 *
 * Les quatre différences qui comptent entre les deux branches :
 *
 *   1. `/ip dns static match-subdomain=yes` n'existe QUE en v7. En v6, couvrir
 *      les sous-domaines impose une expression régulière (`regexp=`).
 *   2. Le matcher `p2p=all-p2p` du firewall n'existe QUE en v6 : MikroTik l'a
 *      SUPPRIMÉ en RouterOS 7. Un script v6 recopié tel quel sur un v7 échoue
 *      au parse. En v7 on coupe le torrent par layer7 + plages de ports.
 *   3. `/ip dns adlist` (listes publiques de dizaines de milliers de domaines,
 *      format hosts) n'arrive qu'en 7.15.
 *   4. Le matcher `tls-host` (SNI) demande au moins 6.41.
 *
 * Un chemin de menu inexistant fait échouer le PARSE de la ligne — pas son
 * exécution — donc on n'émet jamais une ligne que la version ne connaît pas,
 * plutôt que d'espérer qu'elle soit ignorée.
 */
import type { RouterOSClient } from "./client";
import { parseRouterOsVersion, type RouterOsVersion } from "./binary-backup-restore-guard";

/** Commentaire porté par TOUT ce que ce module pose. Clé de la dépose. */
export const CONTENT_FILTER_COMMENT = "safelinkhub-content-filter";

/** Nom du motif layer7 anti-torrent posé en RouterOS 7 (pas de matcher p2p). */
export const TORRENT_L7_NAME = "safelinkhub-torrent";

// ── Catalogue ───────────────────────────────────────────────────────────────

export type ContentCategoryKey = "adult" | "torrent" | "gambling" | "piracy" | "malware";

export type ContentCategory = {
  key: ContentCategoryKey;
  label: string;
  description: string;
  /** Domaines bloqués au DNS (et leurs sous-domaines). */
  domains: string[];
  /**
   * Motifs SNI (`tls-host`) — ils attrapent ce que la liste ne connaît pas
   * (nouveau domaine, accès direct par IP, sous-domaine exotique) au prix de
   * faux positifs. D'où l'option `keywords`, décochable par l'admin.
   */
  keywords: string[];
  /**
   * Liste publique au format hosts, chargée par `/ip dns adlist` — RouterOS
   * 7.15+ UNIQUEMENT. C'est elle qui fait le gros du travail (des dizaines de
   * milliers de domaines) ; les `domains` ci-dessus restent le socle commun
   * aux deux branches.
   */
  adlistUrl?: string;
};

export const CONTENT_CATEGORIES: ContentCategory[] = [
  {
    key: "adult",
    label: "Sites adultes / pornographie",
    description:
      "Tubes, webcams et plateformes pour adultes. La liste publique (RouterOS 7.15+) ajoute ~70 000 domaines au socle ci-dessous.",
    domains: [
      "pornhub.com", "xvideos.com", "xnxx.com", "xhamster.com", "redtube.com",
      "youporn.com", "tube8.com", "spankbang.com", "chaturbate.com", "stripchat.com",
      "bongacams.com", "livejasmin.com", "brazzers.com", "onlyfans.com", "fansly.com",
      "hentaihaven.xxx", "nhentai.net", "rule34.xxx", "e-hentai.org", "motherless.com",
      "porn.com", "sex.com", "beeg.com", "tnaflix.com", "txxx.com",
      "eporner.com", "porntrex.com", "hqporner.com", "javhd.com", "thumbzilla.com",
      "youjizz.com", "hclips.com", "upornia.com", "gotporn.com", "drtuber.com",
      "nuvid.com", "sunporno.com", "pornone.com", "camsoda.com", "myfreecams.com",
      "adultfriendfinder.com", "erome.com",
    ],
    keywords: ["porn", "xxx", "hentai", "xvideos", "xnxx", "xhamster", "camgirl"],
    adlistUrl:
      "https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/porn-only/hosts",
  },
  {
    key: "torrent",
    label: "Torrents / P2P",
    description:
      "Traqueurs, index et clients BitTorrent. Coupe aussi le PROTOCOLE, pas seulement les sites — c'est ce qui sature un lien partagé.",
    domains: [
      "thepiratebay.org", "1337x.to", "rarbg.to", "torrentgalaxy.to", "nyaa.si",
      "yts.mx", "limetorrents.lol", "torlock.com", "kickasstorrents.to", "katcr.co",
      "zooqle.com", "torrentz2.eu", "magnetdl.com", "bitport.io", "seedr.cc",
      "tracker.opentrackr.org", "openbittorrent.com", "utorrent.com", "bittorrent.com",
      "qbittorrent.org",
    ],
    keywords: ["torrent", "1337x", "thepiratebay"],
  },
  {
    key: "gambling",
    label: "Paris et jeux d'argent",
    description: "Bookmakers, casinos et poker en ligne.",
    domains: [
      "bet365.com", "1xbet.com", "1xbet.ci", "betwinner.com", "melbet.com",
      "22bet.com", "premierbet.ci", "betway.com", "williamhill.com", "bwin.com",
      "pokerstars.com", "888casino.com", "unibet.com", "sportybet.com", "betpawa.com",
      "msport.com", "stake.com", "roobet.com", "casino.com", "parionssport.fdj.fr",
    ],
    keywords: ["1xbet", "bet365", "casino", "poker"],
    adlistUrl:
      "https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/gambling-only/hosts",
  },
  {
    key: "piracy",
    label: "Streaming et téléchargement illégaux",
    description: "Sites de films/séries piratés, warez et bibliothèques pirates.",
    domains: [
      "fmovies.to", "123movies.net", "putlocker.vip", "soap2day.to", "sflix.to",
      "gomovies.sx", "primewire.mx", "movies123.net", "yesmovies.ag", "watchseries.id",
      "cuevana3.me", "wcofun.net", "zoro.to", "aniwatch.to", "9anime.to",
      "libgen.is", "z-lib.io", "annas-archive.org", "sci-hub.se", "streamingcommunity.computer",
    ],
    keywords: ["123movies", "fmovies", "putlocker", "soap2day", "watchseries"],
  },
  {
    key: "malware",
    label: "Phishing, malware et arnaques",
    description:
      "Domaines malveillants connus. Repose ENTIÈREMENT sur la liste publique : sans RouterOS 7.15+, cette catégorie ne pose rien.",
    domains: [],
    keywords: [],
    adlistUrl: "https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts",
  },
];

export function findCategory(key: ContentCategoryKey): ContentCategory {
  const c = CONTENT_CATEGORIES.find((x) => x.key === key);
  if (!c) throw new Error(`Catégorie de filtrage inconnue : ${key}`);
  return c;
}

// ── Le plan ─────────────────────────────────────────────────────────────────

export type PlanStep =
  | {
      kind: "add";
      path: string;
      params: Record<string, string>;
      /**
       * Jeu de paramètres de SECOURS, rejoué si le routeur refuse le premier.
       * Mesuré sur HSPT-TOFESSO (RouterOS 7.21) : `type=NXDOMAIN` est la forme
       * juste en v7, mais on ne sait pas à partir de quelle 7.x elle existe —
       * le repli garantit qu'un blocage est posé quoi qu'il arrive.
       */
      fallback?: Record<string, string>;
    }
  | { kind: "set"; path: string; params: Record<string, string> }
  /** `remove [find comment="safelinkhub-content-filter"]` */
  | { kind: "remove-comment"; path: string }
  | { kind: "remove-where"; path: string; field: string; value: string }
  /** Remonte nos règles en TÊTE de chaîne — voir buildInstallPlan. */
  | { kind: "move-top"; path: string };

export type ContentFilterPlan = {
  /** Version retenue pour construire le plan (celle lue sur le routeur). */
  version: RouterOsVersion;
  steps: PlanStep[];
  /** Limites de CETTE version / de ces options, à afficher à l'admin. */
  notes: string[];
  /** Nombre de domaines posés au DNS (hors listes publiques). */
  domainCount: number;
};

export type ContentFilterOptions = {
  categories: ContentCategoryKey[];
  /** Motifs SNI en plus des domaines listés. Défaut : oui. */
  keywords?: boolean;
  /** Rediriger tout le DNS vers le routeur + couper DoT. Défaut : oui. */
  forceDns?: boolean;
  /** Charger les listes publiques (`/ip dns adlist`, 7.15+). Défaut : oui. */
  adlist?: boolean;
};

/** Version supposée quand le routeur n'a pas pu être interrogé. */
export const DEFAULT_ROUTEROS_VERSION: RouterOsVersion = { major: 7, minor: 0, patch: 0 };

export function resolveVersion(raw: string | null | undefined): RouterOsVersion {
  return parseRouterOsVersion(raw) ?? DEFAULT_ROUTEROS_VERSION;
}

const atLeast = (v: RouterOsVersion, major: number, minor: number) =>
  v.major > major || (v.major === major && v.minor >= minor);

/** `tls-host` (SNI) : apparu en 6.41, présent sur toute la branche 7. */
export const supportsTlsHost = (v: RouterOsVersion) => v.major >= 7 || atLeast(v, 6, 41);
/** `/ip dns adlist` : 7.15 et au-delà. */
export const supportsAdlist = (v: RouterOsVersion) => atLeast(v, 7, 15);
/** Le matcher `p2p` a été retiré en RouterOS 7 — il n'existe qu'en v6. */
export const supportsP2pMatcher = (v: RouterOsVersion) => v.major <= 6;

/** Échappe un domaine pour une expression régulière RouterOS (branche v6). */
function domainRegexp(domain: string): string {
  return `(^|\\.)${domain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`;
}

/** Chemins purgés à la dépose — un seul endroit, pose et dépose partagent. */
const MANAGED_PATHS = [
  "/ip/dns/static",
  "/ip/firewall/filter",
  "/ip/firewall/nat",
] as const;

/**
 * Dépose complète : tout ce qui porte notre commentaire, plus le motif layer7
 * (identifié par son nom) et les listes publiques (identifiées par leur URL —
 * `/ip dns adlist` n'expose pas de champ commentaire fiable selon les
 * versions 7.15+, on ne s'y fie donc pas).
 */
export function buildRemovalSteps(version: RouterOsVersion): PlanStep[] {
  return [
    ...MANAGED_PATHS.map((path) => ({ kind: "remove-comment", path }) as PlanStep),
    { kind: "remove-where", path: "/ip/firewall/layer7-protocol", field: "name", value: TORRENT_L7_NAME },
    // `/ip dns adlist` n'existe pas avant 7.15 : émettre sa purge sur un
    // routeur plus ancien ferait échouer le parse de la ligne pour rien.
    ...(supportsAdlist(version)
      ? CONTENT_CATEGORIES.filter((c) => c.adlistUrl).map(
          (c) => ({ kind: "remove-where", path: "/ip/dns/adlist", field: "url", value: c.adlistUrl! }) as PlanStep,
        )
      : []),
  ];
}

export function buildUninstallPlan(rawVersion: string | null | undefined): ContentFilterPlan {
  const version = resolveVersion(rawVersion);
  return {
    version,
    steps: buildRemovalSteps(version),
    notes: [
      "La dépose ne retire QUE ce que SafeLinkHub a posé (commentaire « " +
        CONTENT_FILTER_COMMENT +
        " ») : le reste de la configuration du routeur n'est pas touché.",
    ],
    domainCount: 0,
  };
}

export function buildInstallPlan(
  rawVersion: string | null | undefined,
  opts: ContentFilterOptions,
): ContentFilterPlan {
  const version = resolveVersion(rawVersion);
  const keywords = opts.keywords !== false;
  const forceDns = opts.forceDns !== false;
  const wantAdlist = opts.adlist !== false;
  const categories = opts.categories.map(findCategory);
  const notes: string[] = [];

  // Ré-appliquer purge d'abord : la pose est rejouable sans doublonner.
  const steps: PlanStep[] = buildRemovalSteps(version);

  if (categories.length === 0) {
    return { version, steps: [], notes: ["Aucune catégorie sélectionnée."], domainCount: 0 };
  }

  const comment = CONTENT_FILTER_COMMENT;

  // 1. Résolveur du routeur : sans lui, la redirection DNS n'a rien à servir.
  if (forceDns) {
    steps.push({ kind: "set", path: "/ip/dns", params: { "allow-remote-requests": "yes" } });
  }

  // 2. Blocage DNS des domaines connus — la forme change avec la branche.
  const domains = [...new Set(categories.flatMap((c) => c.domains))];
  for (const domain of domains) {
    steps.push({
      kind: "add",
      path: "/ip/dns/static",
      // RouterOS REFUSE `address=0.0.0.0` sur une entrée statique
      // (« bad A data: IPv4 address expected », relevé en 7.21 sur les 82
      // domaines d'un coup) : 0.0.0.0 n'est pas une adresse joignable, la
      // validation de l'enregistrement A la rejette. En v7 la bonne forme est
      // `type=NXDOMAIN` — le client reçoit « ce domaine n'existe pas » au lieu
      // de tenter une connexion vers le vide. La v6 n'a pas de champ `type` :
      // elle pointe sur la boucle locale, seule adresse toujours valide.
      params:
        version.major >= 7
          ? { name: domain, "match-subdomain": "yes", type: "NXDOMAIN", comment }
          : { regexp: domainRegexp(domain), address: "127.0.0.1", comment },
      fallback:
        version.major >= 7
          ? { name: domain, "match-subdomain": "yes", address: "127.0.0.1", comment }
          : undefined,
    });
  }

  // 3. Listes publiques (le vrai volume) — 7.15+ seulement.
  const adlists = categories.map((c) => c.adlistUrl).filter((u): u is string => Boolean(u));
  if (wantAdlist && adlists.length > 0) {
    if (supportsAdlist(version)) {
      for (const url of adlists) {
        // `ssl-verify=no` : la plupart des routeurs du parc n'ont aucun magasin
        // d'autorités importé, la vérification TLS ferait échouer le
        // téléchargement. Le contenu n'est qu'une liste de domaines à bloquer :
        // au pire une liste falsifiée bloque trop, elle n'ouvre rien.
        steps.push({ kind: "add", path: "/ip/dns/adlist", params: { url, "ssl-verify": "no" } });
      }
    } else {
      notes.push(
        `RouterOS ${version.major}.${version.minor} : « /ip dns adlist » n'existe qu'à partir de 7.15. ` +
          `Seuls les ${domains.length} domaines du socle SafeLinkHub sont posés, au lieu des listes publiques ` +
          `(dizaines de milliers de domaines). Mettre le routeur à jour multiplie l'efficacité du filtre.`,
      );
    }
  }

  // 4. Couche SNI : ce que le DNS ne connaît pas (nouveau domaine, accès direct
  //    par IP, résolveur codé en dur dans l'application).
  const kwList = keywords ? [...new Set(categories.flatMap((c) => c.keywords))] : [];
  if (kwList.length > 0) {
    if (supportsTlsHost(version)) {
      for (const kw of kwList) {
        steps.push({
          kind: "add",
          path: "/ip/firewall/filter",
          params: {
            chain: "forward",
            protocol: "tcp",
            "dst-port": "443",
            "tls-host": `*${kw}*`,
            action: "reject",
            "reject-with": "tcp-reset",
            comment,
          },
        });
      }
      notes.push(
        `Blocage par mot-clé actif (${kwList.length} motifs SNI) : il attrape les domaines absents des listes, ` +
          `mais peut rejeter un site légitime dont le nom contient l'un de ces mots. Décochez l'option en cas de faux positif.`,
      );
    } else {
      notes.push(
        `RouterOS ${version.major}.${version.minor} : le matcher « tls-host » demande au moins 6.41. ` +
          `Le blocage repose uniquement sur le DNS — un client qui connaît l'adresse IP d'un site passe au travers.`,
      );
    }
  } else if (!keywords) {
    notes.push(
      "Blocage par mot-clé désactivé : seuls les domaines explicitement listés sont coupés (aucun faux positif, couverture plus étroite).",
    );
  }

  // 5. Torrents : c'est ici que les deux branches divergent le plus.
  if (opts.categories.includes("torrent")) {
    if (supportsP2pMatcher(version)) {
      steps.push({
        kind: "add",
        path: "/ip/firewall/filter",
        params: { chain: "forward", p2p: "all-p2p", action: "drop", comment },
      });
      notes.push(
        "RouterOS 6 : les torrents sont coupés par le matcher natif « p2p=all-p2p » (reconnaissance intégrée, coût CPU négligeable).",
      );
    } else {
      steps.push({
        kind: "add",
        path: "/ip/firewall/layer7-protocol",
        params: {
          name: TORRENT_L7_NAME,
          regexp:
            "^(\\x13bittorrent protocol|azver\\x01$|get /scrape\\?info_hash=|get /announce\\?info_hash=|get /client/bitcomet/|GET /data\\?fid=)|d1:ad2:id20:",
        },
      });
      steps.push({
        kind: "add",
        path: "/ip/firewall/filter",
        params: { chain: "forward", "layer7-protocol": TORRENT_L7_NAME, action: "drop", comment },
      });
      for (const protocol of ["tcp", "udp"]) {
        steps.push({
          kind: "add",
          path: "/ip/firewall/filter",
          params: { chain: "forward", protocol, "dst-port": "6881-6999", action: "drop", comment },
        });
      }
      notes.push(
        "RouterOS 7 : MikroTik a SUPPRIMÉ le matcher « p2p ». Les torrents sont coupés par un motif layer7 " +
          "plus les plages de ports BitTorrent — efficace, mais le layer7 inspecte le trafic et consomme du CPU " +
          "sur un routeur chargé.",
      );
    }
  }

  // 6. Forçage DNS : sans lui, régler 8.8.8.8 à la main suffit à tout contourner.
  if (forceDns) {
    for (const protocol of ["udp", "tcp"]) {
      steps.push({
        kind: "add",
        path: "/ip/firewall/nat",
        params: {
          chain: "dstnat",
          protocol,
          "dst-port": "53",
          action: "redirect",
          "to-ports": "53",
          comment,
        },
      });
    }
    // DNS-over-TLS (853) : le seul canal de contournement qui a un port à lui.
    steps.push({
      kind: "add",
      path: "/ip/firewall/filter",
      params: { chain: "forward", protocol: "tcp", "dst-port": "853", action: "drop", comment },
    });
    notes.push(
      "Forçage DNS actif : tout le port 53 est renvoyé sur le résolveur du routeur et le DNS-over-TLS (853) est coupé. " +
        "Le DNS-over-HTTPS, lui, se cache dans du 443 ordinaire : les navigateurs qui l'activent tout seuls restent une " +
        "voie de contournement (Firefox, Chrome selon la région).",
    );
  } else {
    notes.push(
      "Forçage DNS désactivé : un client qui saisit 8.8.8.8 dans ses réglages réseau contourne entièrement le blocage DNS.",
    );
  }

  // 7. Nos règles doivent voir la poignée de main TLS. Une chaîne « forward »
  //    ordinaire commence par « accept connection-state=established,related » —
  //    le ClientHello arrive DANS une connexion déjà établie et serait accepté
  //    avant d'atteindre nos règles ajoutées en fin de liste. On les remonte
  //    donc en tête. `move` plutôt que `place-before` : `place-before` exige un
  //    identifiant existant, `move [find …]` ne fait rien sur une liste vide.
  //
  //    Mais PAS en position 0 : RouterOS 7 pose en tête de la chaîne forward une
  //    règle interne (« special dummy rule to show fasttrack counters »), et un
  //    hotspot y ajoute les siennes, toutes DYNAMIQUES. Viser 0 revient à
  //    déplacer ces règles-là → « cannot move builtin », relevé sur
  //    HSPT-TOFESSO. La destination est donc calculée SUR LE ROUTEUR : juste
  //    après le bloc dynamique de tête.
  if (steps.some((s) => s.kind === "add" && s.path === "/ip/firewall/filter")) {
    steps.push({ kind: "move-top", path: "/ip/firewall/filter" });
  }

  return { version, steps, notes, domainCount: domains.length };
}

// ── Sortie 1 : le script copier-coller ──────────────────────────────────────

/** Chemin API (`/ip/dns/static`) → chemin console (`/ip dns static`). */
function consolePath(path: string): string {
  return "/" + path.replace(/^\//, "").split("/").join(" ");
}

/**
 * Une valeur nue ne passe que si elle ne contient rien que la console
 * interprète. Sinon on cite ET on échappe : `\` doublé, `"` protégé, et `$`
 * protégé aussi — dans une chaîne RouterOS, `$` introduit une variable, donc un
 * `azver\x01$` non échappé serait tronqué silencieusement.
 */
export function quoteRos(value: string): string {
  // `:` et `/` restent HORS de la forme nue : une URL nue dans un `[find url=…]`
  // se fait relire comme un début de chemin de menu par la console.
  if (/^[A-Za-z0-9_.-]+$/.test(value)) return value;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\$/g, () => "\\$")}"`;
}

function renderParams(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${k}=${quoteRos(v)}`)
    .join(" ");
}

export function renderStep(step: PlanStep): string {
  const base = consolePath(step.path);
  switch (step.kind) {
    case "add":
      return `${base} add ${renderParams(step.params)}`;
    case "set":
      return `${base} set ${renderParams(step.params)}`;
    case "remove-comment":
      return `${base} remove [find comment=${quoteRos(CONTENT_FILTER_COMMENT)}]`;
    case "remove-where":
      return `${base} remove [find ${step.field}=${quoteRos(step.value)}]`;
    case "move-top":
      return (
        `${base} move [find comment=${quoteRos(CONTENT_FILTER_COMMENT)}]` +
        ` destination=[:len [${base} find where dynamic=yes]]`
      );
  }
}

/**
 * Script `.rsc` prêt à coller dans le terminal du routeur (ou à téléverser).
 * Chaque étape est enveloppée dans `:do {[:parse …]} on-error={}` : une entrée
 * déjà absente à la purge, ou un menu refusé, ne doit pas interrompre le reste
 * du script — et une erreur de PARSE n'est rattrapable qu'ainsi (elle survient
 * avant l'exécution si on écrit la commande en clair).
 */
export function renderPlanScript(plan: ContentFilterPlan): string {
  const header = [
    `# SafeLinkHub — filtrage de contenu (RouterOS ${plan.version.major}.${plan.version.minor})`,
    `# Généré pour cette version : ne le rejouez pas sur une branche majeure différente.`,
    `# Pour tout retirer : chaque ligne "remove [find comment=..." ci-dessous suffit.`,
  ];
  const run = (line: string, sinon: string) =>
    `:do {:local c [:parse ${quoteRos(line)}]; $c} on-error={${sinon}}`;
  const body = plan.steps.map((s) =>
    s.kind === "add" && s.fallback
      ? run(renderStep(s), run(renderStep({ ...s, params: s.fallback }), ""))
      : run(renderStep(s), ""),
  );
  return [...header, ...body, `:log info "SafeLinkHub content filter applied"`].join("\n");
}

// ── Sortie 2 : la même chose via l'API RouterOS ─────────────────────────────

export type ApplyResult = { applied: number; failed: { step: string; error: string }[] };

/** `{name: "x"}` → `["=name=x"]` — la forme mot-à-mot de l'API RouterOS. */
function apiWords(params: Record<string, string>): string[] {
  return Object.entries(params).map(([k, v]) => `=${k}=${v}`);
}

async function idsWhere(
  client: RouterOSClient,
  path: string,
  field: string,
  value: string,
  timeoutMs: number,
): Promise<string[]> {
  const rows = await client
    .talk([`${path}/print`, `?${field}=${value}`], timeoutMs)
    .catch(() => [] as Record<string, string>[]);
  return rows.map((r) => r[".id"]).filter((id): id is string => Boolean(id));
}

/**
 * Exécute le plan via l'API. Les échecs sont COLLECTÉS, pas levés : une entrée
 * refusée (menu absent sur une version inattendue, doublon) ne doit pas laisser
 * le routeur à moitié filtré sans que l'admin sache ce qui manque.
 */
export async function applyPlan(
  client: RouterOSClient,
  plan: ContentFilterPlan,
  timeoutMs = 15000,
): Promise<ApplyResult> {
  const result: ApplyResult = { applied: 0, failed: [] };

  for (const step of plan.steps) {
    const label = renderStep(step);
    try {
      switch (step.kind) {
        case "set": {
          await client.talk([`${step.path}/set`, ...apiWords(step.params)], timeoutMs);
          result.applied++;
          break;
        }
        case "add": {
          try {
            await client.talk([`${step.path}/add`, ...apiWords(step.params)], timeoutMs);
          } catch (err) {
            // Forme refusée par CETTE version : on rejoue le repli plutôt que
            // de laisser un domaine non bloqué. Sans repli, l'échec remonte.
            if (!step.fallback) throw err;
            await client.talk([`${step.path}/add`, ...apiWords(step.fallback)], timeoutMs);
          }
          result.applied++;
          break;
        }
        case "remove-comment":
        case "remove-where": {
          const [field, value] =
            step.kind === "remove-comment"
              ? ["comment", CONTENT_FILTER_COMMENT]
              : [step.field, step.value];
          for (const id of await idsWhere(client, step.path, field, value, timeoutMs)) {
            await client.talk([`${step.path}/remove`, `=numbers=${id}`], timeoutMs).catch(() => {});
          }
          result.applied++;
          break;
        }
        case "move-top": {
          const ids = await idsWhere(client, step.path, "comment", CONTENT_FILTER_COMMENT, timeoutMs);
          // Destination = la première règle qui n'est ni interne/dynamique ni
          // l'une des nôtres. Viser l'index 0 buterait sur la règle « fasttrack
          // counters » de RouterOS 7 et sur les règles dynamiques du hotspot :
          // « cannot move builtin ».
          const rows = await client.talk([`${step.path}/print`], timeoutMs).catch(() => []);
          const mine = new Set(ids);
          const cible = rows.find(
            (r) => r.dynamic !== "true" && r[".id"] && !mine.has(r[".id"]),
          )?.[".id"];
          if (ids.length > 0 && cible) {
            await client.talk(
              [`${step.path}/move`, `=numbers=${ids.join(",")}`, `=destination=${cible}`],
              timeoutMs,
            );
          }
          result.applied++;
          break;
        }
      }
    } catch (err) {
      result.failed.push({ step: label, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return result;
}

export type ContentFilterState = {
  /** Version brute lue sur le routeur (« 7.23.1 (stable) »). */
  rawVersion: string;
  version: RouterOsVersion;
  dnsEntries: number;
  firewallRules: number;
  natRules: number;
  adlists: string[];
  /** Le filtre est-il posé sur ce routeur ? */
  installed: boolean;
};

/** Lit l'état RÉEL sur le routeur — pas ce que la base croit avoir posé. */
export async function readContentFilterState(
  client: RouterOSClient,
  timeoutMs = 15000,
): Promise<ContentFilterState> {
  const resource = await client.talk(["/system/resource/print"], timeoutMs).catch(() => []);
  const rawVersion = resource[0]?.version ?? "";
  const version = resolveVersion(rawVersion);

  const count = async (path: string) =>
    (await idsWhere(client, path, "comment", CONTENT_FILTER_COMMENT, timeoutMs)).length;

  const dnsEntries = await count("/ip/dns/static");
  const firewallRules = await count("/ip/firewall/filter");
  const natRules = await count("/ip/firewall/nat");

  const known = new Set(
    CONTENT_CATEGORIES.map((c) => c.adlistUrl).filter((u): u is string => Boolean(u)),
  );
  const adlistRows = supportsAdlist(version)
    ? await client.talk(["/ip/dns/adlist/print"], timeoutMs).catch(() => [])
    : [];
  const adlists = adlistRows.map((r) => r.url ?? "").filter((u) => known.has(u));

  return {
    rawVersion,
    version,
    dnsEntries,
    firewallRules,
    natRules,
    adlists,
    installed: dnsEntries + firewallRules + natRules + adlists.length > 0,
  };
}
