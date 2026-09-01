import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CONTENT_CATEGORIES,
  CONTENT_FILTER_COMMENT,
  TORRENT_L7_NAME,
  buildInstallPlan,
  buildUninstallPlan,
  quoteRos,
  renderPlanScript,
  renderStep,
  supportsAdlist,
  supportsP2pMatcher,
  supportsTlsHost,
  resolveVersion,
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
    assert.equal(
      renderStep({ kind: "remove-comment", path: "/ip/firewall/nat" }),
      `/ip firewall nat remove [find comment=${CONTENT_FILTER_COMMENT}]`,
    );
    assert.equal(
      renderStep({ kind: "set", path: "/ip/dns", params: { "allow-remote-requests": "yes" } }),
      "/ip dns set allow-remote-requests=yes",
    );
  });
});
