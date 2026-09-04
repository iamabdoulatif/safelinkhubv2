import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import {
  inspectExpiryFormats,
  isIsoExpiryComment,
  isMikhmonExpiryComment,
  isoToMikhmonComment,
} from "./ticket-expiry-format";

describe("reconnaissance des deux formats", () => {
  it("distingue l'ISO de RouterOS 7.24 du format MikHmon", () => {
    assert.equal(isIsoExpiryComment("2026-08-24 20:15:40"), true);
    assert.equal(isIsoExpiryComment("aug/24/2026 20:15:40"), false);
    assert.equal(isMikhmonExpiryComment("aug/24/2026 20:15:40"), true);
    assert.equal(isMikhmonExpiryComment("2026-08-24 20:15:40"), false);
  });

  it("ne prend pas un bon non utilisé pour une date", () => {
    /* « vc-891-08.22.24- » est le préfixe d'un lot MikHmon : le ticket n'a pas
       encore servi, il n'a donc PAS d'expiration. Le confondre avec une date
       cassée ferait réécrire des milliers de lignes pour rien. */
    for (const c of ["vc-891-08.22.24-", "", "up-12-", "counters and limits for trial users"]) {
      assert.equal(isIsoExpiryComment(c), false, c);
      assert.equal(isMikhmonExpiryComment(c), false, c);
    }
  });
});

describe("conversion ISO → MikHmon", () => {
  it("garde l'INSTANT, change seulement l'écriture", () => {
    assert.equal(isoToMikhmonComment("2026-08-24 20:15:40"), "aug/24/2026 20:15:40");
    assert.equal(isoToMikhmonComment("2026-03-15 09:24:32"), "mar/15/2026 09:24:32");
    assert.equal(isoToMikhmonComment("2026-01-01 00:00:00"), "jan/01/2026 00:00:00");
    assert.equal(isoToMikhmonComment("2026-12-31 23:59:59"), "dec/31/2026 23:59:59");
  });

  it("préserve le champ libre du commentaire", () => {
    /* MikHmon lit l'expiration en 0→20 et un commentaire libre à partir de 21 ;
       le SaaS y écrit la date de première connexion. La perdre effacerait ce
       que l'opérateur lit dans sa liste de tickets. */
    assert.equal(
      isoToMikhmonComment("2026-08-24 20:15:40 debut aug/23/2026 20:15:40"),
      "aug/24/2026 20:15:40 debut aug/23/2026 20:15:40",
    );
  });

  it("refuse ce qu'il n'a pas compris", () => {
    assert.equal(isoToMikhmonComment("aug/24/2026 20:15:40"), null);
    assert.equal(isoToMikhmonComment("2026-13-01 00:00:00"), null, "mois 13");
    assert.equal(isoToMikhmonComment("2026-00-10 00:00:00"), null, "mois 0");
    assert.equal(isoToMikhmonComment("2026-08-32 00:00:00"), null, "jour 32");
    assert.equal(isoToMikhmonComment(""), null);
  });
});

describe("inspection d'un parc de tickets", () => {
  it("compte chaque famille et ne propose QUE l'ISO à la réécriture", () => {
    const users = [
      { ".id": "*1", name: "ei46", comment: "2026-08-25 02:15:40" },
      { ".id": "*2", name: "93867", comment: "2026-03-15 09:24:32" },
      { ".id": "*3", name: "58495", comment: "aug/22/2026 14:26:32" },
      { ".id": "*4", name: "uv23", comment: "vc-891-08.22.24-" },
      { ".id": "*5", name: "sans", comment: undefined },
    ];
    const r = inspectExpiryFormats(users);
    assert.equal(r.isoCount, 2);
    assert.equal(r.mikhmonCount, 1);
    assert.equal(r.otherCount, 2);
    assert.deepEqual(
      r.aReecrire.map((l) => [l.name, l.to]),
      [
        ["ei46", "aug/25/2026 02:15:40"],
        ["93867", "mar/15/2026 09:24:32"],
      ],
    );
  });

  it("ignore une ligne sans identifiant — on ne peut pas l'écrire", () => {
    const r = inspectExpiryFormats([{ name: "x", comment: "2026-08-25 02:15:40" }]);
    assert.equal(r.isoCount, 1, "elle est bien COMPTÉE dans le constat");
    assert.equal(r.aReecrire.length, 0, "mais pas proposée à l'écriture");
  });
});

describe("le correctif est branché sur le diagnostic", () => {
  it("l'audit lève un constat corrigeable", async () => {
    const src = await readFile(new URL("./router-audit.ts", import.meta.url), "utf8");
    assert.match(src, /inspectExpiryFormats\(/);
    assert.match(src, /"ticket-expiry-iso"/);
    assert.match(src, /"ticket-expiry",?\s*\n?\s*\);/);
  });

  it("le correctif RÉÉCRIT et ne supprime rien", async () => {
    /* Supprimer des comptes depuis le SaaS contournerait les règles du profil.
       On rend la date lisible ; c'est le balayage du routeur qui tranche. */
    const src = await readFile(new URL("./router-audit-fixes.ts", import.meta.url), "utf8");
    const bloc = src.slice(src.indexOf("export async function rewriteIsoExpiryComments"));
    assert.match(bloc, /\/ip\/hotspot\/user\/set/);
    assert.doesNotMatch(bloc, /\/ip\/hotspot\/user\/remove/);
    assert.doesNotMatch(bloc, /\/ip\/hotspot\/active\/remove/);
  });

  it("l'écran propose le bouton", async () => {
    const src = await readFile(
      new URL("../../app/admin/router/[id]/AuditPanel.tsx", import.meta.url),
      "utf8",
    );
    assert.match(src, /"ticket-expiry":/);
    assert.match(src, /fixRouterTicketExpiryFormat\(routerId\)/);
  });
});

describe("audit de flotte", () => {
  const actions = () => readFile(new URL("./actions.ts", import.meta.url), "utf8");

  it("un routeur hors ligne n'interrompt pas les autres", async () => {
    /* Sur 36 routeurs, il y en a toujours un injoignable : s'arrêter au premier
       échec laisserait le reste du parc non réparé sans le dire. */
    const src = await actions();
    const bloc = src.slice(
      src.indexOf("export async function fixAllRoutersTicketExpiryFormat"),
      src.indexOf("export async function fixRouterTicketExpiryFormat"),
    );
    assert.match(bloc, /unreachable\.push\(router\.name\)/);
    assert.match(bloc, /continue;/, "on passe au routeur suivant");
    assert.match(bloc, /client\.close\(\)/, "et la connexion est refermée");
  });

  it("un admin ne balaie QUE son parc, le superadmin tout le parc", async () => {
    const src = await actions();
    const bloc = src.slice(src.indexOf("export async function fixAllRoutersTicketExpiryFormat"));
    assert.match(
      bloc.slice(0, 1400),
      /isSuperAdmin\(session\.role\) \? isNotNull\(routers\.id\) : eq\(routers\.orgId, session\.orgId\)/,
    );
  });

  it("un passage tient sous la coupure Cloudflare, et dit ce qu'il reste", async () => {
    /* Le parc est sondé en SÉRIE. Sans borne de temps, la Server Action était
       tuée à ~100 s (524) et l'opérateur n'apprenait ni ce qui avait été
       réparé, ni ce qui restait. L'idempotence rend le découpage sûr. */
    const src = await actions();
    const bloc = src.slice(
      src.indexOf("export async function fixAllRoutersTicketExpiryFormat"),
      src.indexOf("export async function fixRouterTicketExpiryFormat"),
    );
    assert.match(bloc, /if \(Date\.now\(\) > echeance\) break;/);
    assert.match(bloc, /remaining: fleet\.length - traites/);
    const budget = src.match(/const BUDGET_FLOTTE_MS = (\d+)_?(\d*)/);
    const ms = Number((budget?.[1] ?? "0") + (budget?.[2] ?? ""));
    assert.ok(ms > 0 && ms < 100_000, `budget hors bornes : ${ms} ms`);

    const bouton = await readFile(
      new URL("../../app/admin/router/TicketExpiryFleetButton.tsx", import.meta.url),
      "utf8",
    );
    assert.match(bouton, /result\.remaining > 0/, "le reste doit être annoncé");
  });

  it("le bouton de flotte est posé dans les outils du parc", async () => {
    // Les trois outils de réparation ont quitté la barre du parc pour le
    // repli « Plus d'actions » (ils occupaient l'écran au même poids que
    // l'action du quotidien). Ils restent atteignables en un geste, et cette
    // garantie-là est ce que le contrôle doit vérifier.
    const outils = await readFile(
      new URL("../../app/admin/router/FleetActions.tsx", import.meta.url),
      "utf8",
    );
    assert.match(outils, /<TicketExpiryFleetButton t=\{actions\} \/>/);

    const table = await readFile(
      new URL("../../app/admin/router/RoutersTable.tsx", import.meta.url),
      "utf8",
    );
    assert.match(table, /<FleetActions[^>]*actions=\{actions\}/);
  });

  it("les deux dictionnaires décrivent le même bouton", async () => {
    const cles = async (f: string) => {
      const src = await readFile(new URL(`../i18n/admin/${f}`, import.meta.url), "utf8");
      return [...src.matchAll(/^ *(ticketExpiry\w*):/gm)].map((m) => m[1]).sort();
    };
    const fr = await cles("fr.ts");
    assert.ok(fr.length >= 5, `clés attendues, trouvées : ${fr.join(", ")}`);
    assert.deepEqual(fr, await cles("en.ts"));
  });
});
