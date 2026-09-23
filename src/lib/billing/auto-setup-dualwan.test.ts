import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { autoSetupPriceFcfa, dualWanPaidFor } from "./auto-setup-gate-config";
import { STARLINK_PAIRS } from "@/lib/mikrotik/dualwan-defaults";

const PRIX = {
  priceWithContainerFcfa: 15000,
  priceWithoutContainerFcfa: 10000,
  dualWanOptionFcfa: 25000,
};

describe("option dual WAN de l'auto-setup", () => {
  it("s'ajoute au socle, qui dépend toujours du type de routeur", () => {
    assert.equal(autoSetupPriceFcfa(PRIX, true), 15000);
    assert.equal(autoSetupPriceFcfa(PRIX, false), 10000);
    assert.equal(autoSetupPriceFcfa(PRIX, true, true), 40000);
    assert.equal(autoSetupPriceFcfa(PRIX, false, true), 35000);
  });

  it("un tarif simple ne donne PAS droit à la répartition PCC", () => {
    // Le piège que la garde existe pour attraper : payer 15 000 puis cocher
    // « deux antennes » sur l'écran avant de lancer l'installation.
    assert.equal(dualWanPaidFor(PRIX, { amountFcfa: 15000, supportsContainers: true }), false);
    assert.equal(dualWanPaidFor(PRIX, { amountFcfa: 40000, supportsContainers: true }), true);
  });

  it("chaque type de routeur est jugé sur SON socle", () => {
    // 35 000 suffisent pour un routeur sans conteneur (10 000 + 25 000), pas
    // pour un routeur avec conteneur (15 000 + 25 000).
    assert.equal(dualWanPaidFor(PRIX, { amountFcfa: 35000, supportsContainers: false }), true);
    assert.equal(dualWanPaidFor(PRIX, { amountFcfa: 35000, supportsContainers: true }), false);
  });
});

describe("appairages Starlink", () => {
  it("les quatre couples proposés existent dans le workflow n8n", () => {
    // La plateforme ne fait qu'envoyer un `cas` : s'il n'est pas dans le
    // tableau CAS du nœud « Valider la demande », n8n refuse la demande et
    // l'admin paie une option qui ne s'installe jamais.
    const wf = JSON.parse(
      readFileSync(new URL("../../../docs/n8n/dualwan-workflow.json", import.meta.url), "utf8"),
    ) as { nodes: { name: string; parameters: { jsCode?: string } }[] };
    const code = wf.nodes.find((n) => n.name === "Valider la demande")?.parameters.jsCode ?? "";
    assert.equal(STARLINK_PAIRS.length, 4);
    for (const p of STARLINK_PAIRS) {
      assert.match(code, new RegExp(`\\b${p.cas}:`), `${p.cas} absent du workflow n8n`);
    }
    // Le Mini en premier est bien le couple inversé (1:3), pas un doublon.
    assert.equal(STARLINK_PAIRS.find((p) => p.cas === "cas4")?.ratio, "1:3");
    assert.equal(STARLINK_PAIRS.find((p) => p.cas === "cas1")?.ratio, "3:1");
  });
});

describe("garde du moteur n8n", () => {
  it("la sonde juge sur la réponse HTTP, et ne touche jamais un routeur", () => {
    const src = readFileSync(new URL("../mikrotik/dualwan-actions.ts", import.meta.url), "utf8");
    // Demande volontairement incomplète : elle est rejetée par la validation
    // n8n avant le moindre SSH. Si elle portait un routeur réel, une sonde
    // pourrait reconfigurer une installation.
    assert.match(src, /router_id: "slh-preflight"/);
    assert.ok(!/router_pass/.test(src.slice(src.indexOf("dualWanEngineReady"), src.indexOf("export async function startDualWan"))));
    // 2xx = le moteur a pris la demande. Un 500 (quota épuisé) doit fermer
    // l'option, pas la laisser payer dans le vide.
    assert.match(src, /sonde = \{ at: Date\.now\(\), ready: res\.ok/);
  });
});
