import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import { guardTransferApproval, guardTransferRequest } from "./router-transfer";

describe("demande de transfert", () => {
  const base = { routerOrgId: "org-a", requesterOrgId: "org-a", targetOrgId: null, dejaEnAttente: false };

  it("refuse un routeur qui n'appartient pas au demandeur", () => {
    /* L'identifiant du routeur vient du formulaire : sans cette comparaison,
       n'importe quel compte demanderait le transfert du parc d'un autre. */
    assert.equal(guardTransferRequest({ ...base, requesterOrgId: "org-b" }).ok, false);
  });

  it("refuse une deuxième demande sur le même routeur", () => {
    assert.equal(guardTransferRequest({ ...base, dejaEnAttente: true }).ok, false);
  });

  it("accepte une demande légitime", () => {
    assert.equal(guardTransferRequest(base).ok, true);
  });
});

describe("décision du superadmin", () => {
  const base = {
    routerOrgId: "org-a",
    fromOrgId: "org-a",
    targetOrgId: "org-b",
    status: "pending",
  };

  it("refuse une demande déjà tranchée", () => {
    assert.equal(guardTransferApproval({ ...base, status: "approved" }).ok, false);
    assert.equal(guardTransferApproval({ ...base, status: "cancelled" }).ok, false);
  });

  it("refuse quand aucun compte ne porte l'adresse", () => {
    /* La cible est désignée par courriel À LA DEMANDE et résolue à la DÉCISION :
       le compte peut ne jamais avoir été créé. Transférer vers null détacherait
       le routeur de toute organisation. */
    const v = guardTransferApproval({ ...base, targetOrgId: null });
    assert.equal(v.ok, false);
    assert.match(v.ok === false ? v.error : "", /créer son compte/);
  });

  it("refuse un transfert vers le propriétaire actuel", () => {
    assert.equal(guardTransferApproval({ ...base, targetOrgId: "org-a" }).ok, false);
  });

  it("refuse si le routeur a changé de mains depuis la demande", () => {
    const v = guardTransferApproval({ ...base, routerOrgId: "org-c" });
    assert.equal(v.ok, false);
    assert.match(v.ok === false ? v.error : "", /changé de propriétaire/);
  });

  it("accepte le cas nominal", () => {
    assert.equal(guardTransferApproval(base).ok, true);
  });
});

describe("ce que le transfert déplace, et ce qu'il laisse", () => {
  const source = () => readFile(new URL("./router-transfer-actions.ts", import.meta.url), "utf8");

  it("déplace le verrou de numéro de série avec le routeur", async () => {
    /* Sans lui, la synchronisation suivante verrait un SN rattaché à l'ancien
       compte et garderait le routeur hors ligne — chez personne. */
    const src = await source();
    assert.match(src, /update\(routerSerialLocks\)[\s\S]{0,120}eq\(routerSerialLocks\.routerId/);
  });

  it("ne touche PAS à l'historique commercial", async () => {
    /* Ventes, commandes du portail et tickets déjà vendus restent à
       l'organisation qui les a encaissés : les faire suivre changerait
       rétroactivement le chiffre d'affaires des DEUX comptes. */
    const src = await source();
    for (const table of ["portalOrders", "vouchers", "walletTransactions", "expenses"]) {
      assert.doesNotMatch(src, new RegExp(`update\\(${table}\\)`), `${table} ne doit pas bouger`);
    }
  });

  it("sort le routeur des groupes de roaming au lieu de les emporter", async () => {
    // Un groupe couvre plusieurs zones d'une MÊME organisation : le déplacer
    // priverait les autres routeurs de leur groupe.
    const src = await source();
    assert.match(src, /delete\(roamingGroupRouters\)/);
    assert.doesNotMatch(src, /update\(roamingGroups\)/);
  });

  it("écrit tout dans UNE transaction", async () => {
    const src = await source();
    const bloc = src.slice(src.indexOf("export async function decideRouterTransfer"));
    assert.match(bloc, /db\.transaction\(async \(tx\) => \{/);
    // Le routeur et son verrou doivent être dans la MÊME transaction.
    const transaction = bloc.slice(bloc.indexOf("db.transaction"));
    assert.match(transaction, /tx\.update\(routers\)/);
    assert.match(transaction, /tx\s*\n?\s*\.update\(routerSerialLocks\)/);
  });

  it("la décision est réservée au superadmin", async () => {
    const src = await source();
    const bloc = src.slice(src.indexOf("export async function decideRouterTransfer"));
    assert.match(bloc.slice(0, 400), /isSuperAdmin\(session\.role\)/);
  });
});
