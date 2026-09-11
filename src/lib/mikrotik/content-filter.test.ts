import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CONTENT_CATEGORIES,
  CONTENT_FILTER_COMMENT,
  TORRENT_L7_NAME,
  applyPlan,
  buildInstallPlan,
  buildUninstallPlan,
  categoryComment,
  commentCategory,
  quoteRos,
  renderPlanScript,
  renderStep,
  supportsAdlist,
  supportsP2pMatcher,
  supportsTlsHost,
  memePose,
  resolveVersion,
  type ContentCategoryKey,
  type PlanStep,
} from "./content-filter";

const ALL = CONTENT_CATEGORIES.map((c) => c.key);

const script = (raw: string, opts = {}) =>
  renderPlanScript(buildInstallPlan(raw, { categories: ALL, ...opts }));

const adds = (raw: string, opts = {}) =>
  buildInstallPlan(raw, { categories: ALL, ...opts }).steps.filter(
    (s): s is Extract<PlanStep, { kind: "add" }> => s.kind === "add",
  );

describe("portes de version", () => {
  it("situe chaque fonctionnalité sur la bonne branche", () => {
    assert.equal(supportsP2pMatcher(resolveVersion("6.49.10 (long-term)")), true);
    assert.equal(supportsP2pMatcher(resolveVersion("7.23.1")), false);
    assert.equal(supportsTlsHost(resolveVersion("6.40.9")), false);
    assert.equal(supportsTlsHost(resolveVersion("6.41")), true);
    assert.equal(supportsAdlist(resolveVersion("7.14.3")), false);
    assert.equal(supportsAdlist(resolveVersion("7.15")), true);
    // Version illisible : on ne devine pas v6, on retombe sur la branche du parc.
    assert.equal(resolveVersion(null).major, 7);
  });
});

describe("blocage DNS : la forme dépend de la branche", () => {
  it("v7 utilise match-subdomain, v6 une expression régulière", () => {
    const v7 = adds("7.23.1").find((s) => s.path === "/ip/dns/static")!;
    assert.equal(v7.params["match-subdomain"], "yes");
    assert.ok(v7.params.name);
    assert.equal(v7.params.regexp, undefined);

    const v6 = adds("6.49.10").find((s) => s.path === "/ip/dns/static")!;
    // match-subdomain n'existe pas en v6 : l'émettre ferait échouer la ligne.
    assert.equal(v6.params["match-subdomain"], undefined);
    assert.match(v6.params.regexp, /^\(\^\|\\\.\)/);
    assert.ok(v6.params.regexp.endsWith("$"));
    // Le point du domaine est échappé, sinon « pornhubXcom » correspondrait.
    assert.ok(v6.params.regexp.includes("\\."));
  });
});

/* Deux défauts relevés sur HSPT-TOFESSO (RouterOS 7.21), premier tir réel :
   82 entrées DNS refusées d'un coup et le classement des règles impossible. */
describe("régressions HSPT-TOFESSO", () => {
  it("ne pose jamais address=0.0.0.0 : RouterOS rejette « bad A data »", () => {
    for (const v of ["6.49.10", "7.21.0", "7.23.1"]) {
      const dns = adds(v).filter((s) => s.path === "/ip/dns/static");
      assert.ok(dns.length > 0);
      assert.ok(dns.every((s) => s.params.address !== "0.0.0.0"));
      assert.ok(dns.every((s) => Object.values(s.fallback ?? {}).every((x) => x !== "0.0.0.0")));
    }
  });

  it("v7 bloque par NXDOMAIN, avec repli sur la boucle locale", () => {
    const s = adds("7.21.0").find((x) => x.path === "/ip/dns/static")!;
    assert.equal(s.params.type, "NXDOMAIN");
    assert.equal(s.params.address, undefined);
    // Une 7.x sans NXDOMAIN doit quand même repartir avec un blocage.
    assert.equal(s.fallback?.address, "127.0.0.1");
    // Le repli garde le nom ET la portée sous-domaines de l'entrée d'origine.
    assert.equal(s.fallback?.name, s.params.name);
    assert.equal(s.fallback?.["match-subdomain"], "yes");
  });

  it("v6 n'a pas de champ type : il pointe sur la boucle locale", () => {
    const s = adds("6.49.10").find((x) => x.path === "/ip/dns/static")!;
    assert.equal(s.params.type, undefined);
    assert.equal(s.params.address, "127.0.0.1");
  });

  it("le classement des règles ne vise plus l'index 0 (« cannot move builtin »)", () => {
    // La règle interne « fasttrack counters » et les règles dynamiques du
    // hotspot occupent la tête de chaîne : la destination est calculée sur le
    // routeur, jamais codée à 0.
    const ligne = renderStep({ kind: "move-top", path: "/ip/firewall/filter" });
    assert.ok(!ligne.includes("destination=0"));
    assert.match(ligne, /destination=\[:len \[\/ip firewall filter find where dynamic=yes\]\]/);
  });

  it("le script rejoue le repli quand la forme principale est refusée", () => {
    const out = renderPlanScript(buildInstallPlan("7.21.0", { categories: ["adult"] }));
    const ligne = out.split("\n").find((l) => l.includes("type=NXDOMAIN"))!;
    // on-error imbriqué : forme v7 d'abord, boucle locale ensuite.
    assert.match(ligne, /on-error=\{:do \{.*address=127\.0\.0\.1.*\} on-error=\{\}\}$/);
  });
});

describe("torrents : le matcher p2p n'existe qu'en v6", () => {
  it("v6 pose p2p=all-p2p et aucun layer7", () => {
    const s = adds("6.49.10");
    assert.ok(s.some((x) => x.params.p2p === "all-p2p"));
    assert.ok(!s.some((x) => x.path === "/ip/firewall/layer7-protocol"));
  });

  it("v7 remplace p2p par layer7 + plages de ports", () => {
    const s = adds("7.23.1");
    // p2p a été SUPPRIMÉ en RouterOS 7 : l'émettre casserait le script entier.
    assert.ok(!s.some((x) => x.params.p2p));
    const l7 = s.find((x) => x.path === "/ip/firewall/layer7-protocol")!;
    assert.equal(l7.params.name, TORRENT_L7_NAME);
    assert.ok(s.some((x) => x.params["layer7-protocol"] === TORRENT_L7_NAME));
    assert.equal(s.filter((x) => x.params["dst-port"] === "6881-6999").length, 2);
  });

  it("le layer7 ne lit pas le TCP/443 : chiffré, le motif ne peut pas s'y trouver", () => {
    // Le matcher inspecte les premiers paquets de chaque connexion atteinte.
    // Sans pré-filtre il lisait tout le HTTPS — la majorité du trafic — pour
    // rien (KONGASSO-HTSPT). Une règle qui filtre plus étroit bloque moins,
    // jamais plus : c'est un resserrement sûr.
    const l7 = adds("7.23.1").filter((x) => x.params["layer7-protocol"] === TORRENT_L7_NAME);
    const tcp = l7.find((x) => x.params.protocol === "tcp")!;
    const udp = l7.find((x) => x.params.protocol === "udp")!;
    assert.equal(tcp.params["dst-port"], "!443");
    // L'UDP reste entier : le DHT n'a pas de port fixe.
    assert.equal(udp.params["dst-port"], undefined);
    // Aucune règle layer7 sans protocole : elle verrait tout.
    assert.ok(l7.every((x) => x.params.protocol));
  });

  it("la négation de port survit au rendu console", () => {
    const ligne = renderPlanScript(buildInstallPlan("7.23.1", { categories: ["torrent"] }))
      .split("\n")
      .find((l) => l.includes("layer7-protocol=safelinkhub-torrent") && l.includes("protocol=tcp"))!;
    // `!` n'est pas un caractère « nu » pour la console : la valeur doit être
    // citée, sinon RouterOS la lirait comme un début de commande.
    assert.ok(ligne.includes('dst-port=\\"!443\\"'), ligne);
  });
});

describe("listes publiques et SNI", () => {
  it("adlist seulement à partir de 7.15, avec une note sinon", () => {
    assert.ok(adds("7.15.3").some((s) => s.path === "/ip/dns/adlist"));

    const vieux = buildInstallPlan("7.14.3", { categories: ALL });
    assert.ok(!vieux.steps.some((s) => s.kind === "add" && s.path === "/ip/dns/adlist"));
    assert.ok(vieux.notes.some((n) => n.includes("7.15")));
  });

  it("tls-host seulement à partir de 6.41", () => {
    assert.ok(adds("7.23.1").some((s) => s.params["tls-host"]));
    const vieux = buildInstallPlan("6.40.9", { categories: ALL });
    assert.ok(!vieux.steps.some((s) => s.kind === "add" && s.params["tls-host"]));
    assert.ok(vieux.notes.some((n) => n.includes("tls-host")));
  });

  it("les mots-clés sont décochables (faux positifs)", () => {
    assert.ok(!adds("7.23.1", { keywords: false }).some((s) => s.params["tls-host"]));
  });
});

describe("pose rejouable et dépose totale", () => {
  it("la pose purge d'abord : la rejouer ne doublonne pas", () => {
    const plan = buildInstallPlan("7.23.1", { categories: ALL });
    const purges = plan.steps.filter((s) => s.kind.startsWith("remove"));
    assert.ok(purges.length > 0);
    // Toute purge précède le premier ajout.
    const premierAjout = plan.steps.findIndex((s) => s.kind === "add");
    const dernierePurge = plan.steps.map((s) => s.kind).lastIndexOf("remove-where");
    assert.ok(dernierePurge < premierAjout);
  });

  it("tout chemin écrit est un chemin purgé", () => {
    const ecrits = new Set(
      buildInstallPlan("7.23.1", { categories: ALL })
        .steps.filter((s) => s.kind === "add")
        .map((s) => s.path),
    );
    const purges = new Set(
      buildUninstallPlan("7.23.1").steps.map((s) => s.path),
    );
    for (const p of ecrits) assert.ok(purges.has(p), `${p} n'est jamais retiré`);
  });

  it("les règles de firewall sont remontées en tête de chaîne", () => {
    // Sans ça, un « accept established,related » placé avant les avale.
    const plan = buildInstallPlan("7.23.1", { categories: ALL });
    assert.equal(plan.steps.at(-1)?.kind, "move-top");
  });

  it("sans catégorie, le plan est vide", () => {
    assert.deepEqual(buildInstallPlan("7.23.1", { categories: [] }).steps, []);
  });
});

describe("échappement console", () => {
  it("cite et protège \\ \" et $", () => {
    assert.equal(quoteRos("drop"), "drop");
    assert.equal(quoteRos("*porn*"), '"*porn*"');
    // `$` non protégé = début de variable RouterOS → valeur tronquée.
    assert.equal(quoteRos("azver\\x01$"), '"azver\\\\x01\\$"');
  });

  it("le script enveloppe chaque ligne pour survivre à une erreur de parse", () => {
    const out = script("7.23.1");
    for (const line of out.split("\n")) {
      if (line.startsWith("#") || line.startsWith(":log")) continue;
      // Deux formes admises : sans repli, ou avec un second :do en on-error.
      assert.match(
        line,
        /^:do \{:local c \[:parse ".*"\]; \$c\} on-error=\{(|:do \{:local c \[:parse ".*"\]; \$c\} on-error=\{\})\}$/,
      );
    }
    assert.ok(out.includes(CONTENT_FILTER_COMMENT));
  });

  it("n'émet jamais un menu absent de la branche visée", () => {
    const v6 = script("6.49.10");
    assert.ok(!v6.includes("/ip dns adlist"));
    assert.ok(!v6.includes("layer7-protocol add"));
    assert.ok(!v6.includes("match-subdomain"));

    const v7 = script("7.23.1");
    assert.ok(!v7.includes("p2p=all-p2p"));
  });

  it("rend une commande console lisible", () => {
    // Sans commentaire explicite : préfixe, pour emporter aussi les poses
    // héritées (commentaire nu) et toutes les catégories d'un coup.
    assert.equal(
      renderStep({ kind: "remove-comment", path: "/ip/firewall/nat" }),
      `/ip firewall nat remove [find where comment~"^${CONTENT_FILTER_COMMENT}"]`,
    );
    assert.equal(
      renderStep({ kind: "remove-comment", path: "/ip/dns/static", comment: categoryComment("adult") }),
      `/ip dns static remove [find comment="${CONTENT_FILTER_COMMENT} adult"]`,
    );
    assert.equal(
      renderStep({ kind: "set", path: "/ip/dns", params: { "allow-remote-requests": "yes" } }),
      "/ip dns set allow-remote-requests=yes",
    );
  });
});

/* La catégorie « updates » vise le premier poste de consommation d'un hotspot
   (mises à jour de fond). Elle n'a de valeur que si elle coupe les CDN de
   distribution SANS couper les domaines racines dont dépendent le compte, la
   messagerie et l'activation — c'est là qu'une liste trop large casse tout. */
describe("catégorie « updates » : couper la distribution, pas le service", () => {
  const dnsNames = (raw: string) =>
    buildInstallPlan(raw, { categories: ["updates"] })
      .steps.filter((s): s is Extract<PlanStep, { kind: "add" }> => s.kind === "add")
      .filter((s) => s.path === "/ip/dns/static")
      .map((s) => s.params.name);

  it("bloque les CDN de mise à jour", () => {
    const noms = dnsNames("7.23.1");
    for (const attendu of [
      "windowsupdate.com",
      "swcdn.apple.com",
      "android.clients.google.com",
      "steamcontent.com",
    ]) {
      assert.ok(noms.includes(attendu), `${attendu} devrait être bloqué`);
    }
  });

  it("ne coupe JAMAIS un domaine racine", () => {
    // match-subdomain=yes : poser « apple.com » couperait iMessage, l'App
    // Store, l'activation et Find My d'un seul coup.
    for (const racine of ["microsoft.com", "apple.com", "google.com", "googleapis.com", "xboxlive.com"]) {
      assert.ok(!dnsNames("7.23.1").includes(racine), `${racine} ne doit pas être bloqué`);
    }
  });

  it("garde des motifs SNI étroits", () => {
    const cat = CONTENT_CATEGORIES.find((c) => c.key === "updates")!;
    // « update » / « download » seuls rejetteraient une part énorme du web.
    for (const kw of cat.keywords) {
      assert.ok(kw.length >= 10, `motif SNI trop large : ${kw}`);
    }
  });

  it("n'apporte aucune liste publique (aucune ne vise les mises à jour)", () => {
    const cat = CONTENT_CATEGORIES.find((c) => c.key === "updates")!;
    assert.equal(cat.adlistUrl, undefined);
  });
});

/* Retirer « Torrents » ne doit pas rouvrir « Adultes ». Chaque ressource est
   donc attribuée à SA catégorie par son commentaire, et le socle partagé
   (forçage DNS) garde le commentaire nu pour ne tomber avec aucune. */
describe("retrait catégorie par catégorie", () => {
  const plan = buildInstallPlan("7.23.1", { categories: ALL });
  const ajouts = plan.steps.filter(
    (s): s is Extract<PlanStep, { kind: "add" }> => s.kind === "add",
  );

  it("chaque domaine porte le commentaire de sa catégorie", () => {
    const dns = ajouts.filter((s) => s.path === "/ip/dns/static");
    for (const s of dns) {
      assert.ok(commentCategory(s.params.comment), `commentaire non attribué : ${s.params.comment}`);
      // Le repli doit porter le MÊME commentaire, sinon une entrée posée par
      // repli échappe à la dépose de sa catégorie.
      assert.equal(s.fallback?.comment, s.params.comment);
    }
    const pornhub = dns.find((s) => s.params.name === "pornhub.com")!;
    assert.equal(commentCategory(pornhub.params.comment), "adult");
    const pirate = dns.find((s) => s.params.name === "thepiratebay.org")!;
    assert.equal(commentCategory(pirate.params.comment), "torrent");
  });

  it("le socle partagé (forçage DNS) garde le commentaire NU", () => {
    // Il ne doit tomber avec AUCUNE catégorie : sans lui, 8.8.8.8 à la main
    // contourne le blocage de toutes les catégories restées actives.
    const nat = ajouts.filter((s) => s.path === "/ip/firewall/nat");
    assert.ok(nat.length > 0);
    assert.ok(nat.every((s) => s.params.comment === CONTENT_FILTER_COMMENT));
    const dot = ajouts.find((s) => s.params["dst-port"] === "853")!;
    assert.equal(dot.params.comment, CONTENT_FILTER_COMMENT);
  });

  it("la dépose d'une catégorie ne touche qu'elle", () => {
    const steps = buildUninstallPlan("7.23.1", ["torrent"]).steps;
    const commentaires = steps
      .filter((s) => s.kind === "remove-comment")
      .map((s) => (s as Extract<PlanStep, { kind: "remove-comment" }>).comment);
    assert.ok(commentaires.length > 0);
    // Aucune purge par préfixe (elle emporterait tout) ni du commentaire nu
    // (elle emporterait le socle partagé).
    assert.ok(commentaires.every((c) => c === categoryComment("torrent")));
    // Le NAT partagé n'est jamais visé par une dépose de catégorie.
    assert.ok(!steps.some((s) => s.path === "/ip/firewall/nat"));
    // Le motif layer7 appartient aux torrents : il part avec eux.
    assert.ok(steps.some((s) => s.kind === "remove-where" && s.value === TORRENT_L7_NAME));
  });

  it("retirer une catégorie sans layer7 laisse le motif torrent en place", () => {
    const steps = buildUninstallPlan("7.23.1", ["gambling"]).steps;
    assert.ok(!steps.some((s) => s.kind === "remove-where" && s.value === TORRENT_L7_NAME));
    // Seule la liste publique des paris part, pas celle des sites adultes.
    const urls = steps.filter((s) => s.path === "/ip/dns/adlist").map((s) => (s as Extract<PlanStep, { kind: "remove-where" }>).value);
    assert.deepEqual(urls, [CONTENT_CATEGORIES.find((c) => c.key === "gambling")!.adlistUrl]);
  });

  it("re-bloquer une catégorie seule ne purge pas les autres", () => {
    const plan = buildInstallPlan("7.23.1", { categories: ["gambling"] }, "selected");
    const purges = plan.steps.filter((s) => s.kind === "remove-comment") as Extract<
      PlanStep,
      { kind: "remove-comment" }
    >[];
    // Uniquement la catégorie visée + le socle partagé (re-posé juste après,
    // donc sans doublon). Jamais de purge par préfixe.
    assert.ok(purges.length > 0);
    assert.ok(
      purges.every(
        (s) => s.comment === categoryComment("gambling") || s.comment === CONTENT_FILTER_COMMENT,
      ),
    );
    // Aucun domaine d'une autre catégorie n'est re-posé.
    const noms = plan.steps
      .filter((s): s is Extract<PlanStep, { kind: "add" }> => s.kind === "add")
      .filter((s) => s.path === "/ip/dns/static")
      .map((s) => s.params.name);
    assert.ok(noms.includes("bet365.com"));
    assert.ok(!noms.includes("pornhub.com"));
  });

  it("la ré-application, elle, purge tout (les décochées disparaissent)", () => {
    const purges = buildInstallPlan("7.23.1", { categories: ["gambling"] }).steps.filter(
      (s) => s.kind === "remove-comment",
    ) as Extract<PlanStep, { kind: "remove-comment" }>[];
    assert.ok(purges.length > 0);
    assert.ok(purges.every((s) => s.comment === undefined));
  });

  it("commentCategory ignore ce qui n'est pas à nous", () => {
    assert.equal(commentCategory("hotspot"), null);
    assert.equal(commentCategory(undefined), null);
    // Commentaire nu = pose héritée : reconnue comme nôtre, mais non attribuable.
    assert.equal(commentCategory(CONTENT_FILTER_COMMENT), null);
    assert.equal(commentCategory(categoryComment("piracy")), "piracy");
  });
});

/* Re-poser un filtre déjà en place purge et repose ~110 entrées DNS et fait
   redémarrer le résolveur — c'est après une telle ré-application que le proxy
   DNS du hotspot de HSPT-FOUANGA est mort. Une pose identique se refuse. */
describe("refus d'une pose identique", () => {
  const pose = { installed: true, legacy: false, categories: ["adult", "torrent"] as ContentCategoryKey[] };
  const memo = { keywords: true, forceDns: true, adlist: true };

  it("mêmes catégories, mêmes options → identique", () => {
    assert.equal(memePose(pose, memo, { categories: ["torrent", "adult"] }), true);
  });

  it("une catégorie ou une option en plus/en moins → pas identique", () => {
    assert.equal(memePose(pose, memo, { categories: ["adult"] }), false);
    assert.equal(memePose(pose, memo, { categories: ["adult", "torrent", "gambling"] }), false);
    assert.equal(memePose(pose, memo, { categories: ["adult", "torrent"], keywords: false }), false);
  });

  it("un filtre hérité ou absent n'est jamais « identique » : la pose est utile", () => {
    // Hérité : le re-poser attribue les entrées à leur catégorie.
    assert.equal(memePose({ ...pose, legacy: true }, memo, { categories: ["adult", "torrent"] }), false);
    assert.equal(memePose({ ...pose, installed: false }, memo, { categories: ["adult", "torrent"] }), false);
    // Sans mémo, on ne connaît pas les options posées : on ne refuse pas.
    assert.equal(memePose(pose, null, { categories: ["adult", "torrent"] }), false);
  });
});

/* Un `/ip dns set` rejoué sans changement fait redémarrer le résolveur que le
   proxy DNS du hotspot interroge. applyPlan lit avant d'écrire. */
describe("applyPlan ne rejoue pas un set déjà en place", () => {
  const faux = (etat: Record<string, string>) => {
    const commandes: string[][] = [];
    const client = {
      talk: async (words: string[]) => {
        commandes.push(words);
        return words[0].endsWith("/print") ? [etat] : [];
      },
      close() {},
    } as unknown as import("./client").RouterOSClient;
    return { client, commandes };
  };
  const plan = {
    version: resolveVersion("7.23.1"),
    notes: [],
    domainCount: 0,
    steps: [{ kind: "set", path: "/ip/dns", params: { "allow-remote-requests": "yes" } } as PlanStep],
  };

  it("valeur déjà posée : aucun set émis", async () => {
    const { client, commandes } = faux({ "allow-remote-requests": "yes" });
    const res = await applyPlan(client, plan);
    assert.equal(res.applied, 1);
    assert.ok(!commandes.some((w) => w[0] === "/ip/dns/set"), "un set a été rejoué pour rien");
  });

  it("valeur différente : le set part", async () => {
    const { client, commandes } = faux({ "allow-remote-requests": "no" });
    await applyPlan(client, plan);
    assert.ok(commandes.some((w) => w[0] === "/ip/dns/set"));
  });
});
