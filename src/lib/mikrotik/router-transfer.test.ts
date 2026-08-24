import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import {
  guardDeclaredSerial,
  guardTransferApproval,
  guardTransferRequest,
  normalizeSerial,
} from "./router-transfer";

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

describe("numéro de série déclaré", () => {
  it("ignore casse et séparateurs de l'étiquette", () => {
    /* Les étiquettes MikroTik se lisent par groupes (« 7C1A 0B2E ») et se
       recopient avec des espaces ou des tirets qui n'appartiennent pas au
       numéro. Les compter ferait échouer une saisie pourtant juste. */
    assert.equal(normalizeSerial(" 7c1a-0b2e "), "7C1A0B2E");
    assert.equal(
      guardDeclaredSerial({ declared: "7c1a 0b2e", known: "7C1A0B2E" }).ok,
      true,
    );
  });

  it("refuse un numéro qui ne correspond pas au routeur choisi", () => {
    const v = guardDeclaredSerial({ declared: "AAAA1111", known: "BBBB2222" });
    assert.equal(v.ok, false);
    assert.match(v.ok === false ? v.error : "", /ne correspond pas/);
  });

  it("refuse une saisie vide ou trop courte", () => {
    assert.equal(guardDeclaredSerial({ declared: "", known: "AAAA1111" }).ok, false);
    assert.equal(guardDeclaredSerial({ declared: "AB", known: null }).ok, false);
  });

  it("accepte quand le SaaS ne connaît AUCUN numéro pour ce routeur", () => {
    /* Carte hors RouterBOARD ou jamais synchronisée : bloquer un transfert
       légitime serait pire. Même posture que reserveRouterSerial, qui autorise
       sans verrou quand le SN est illisible. */
    assert.equal(guardDeclaredSerial({ declared: "AAAA1111", known: null }).ok, true);
  });
});

describe("le numéro de série est exigé à la demande", () => {
  const source = () => readFile(new URL("./router-transfer-actions.ts", import.meta.url), "utf8");

  it("la demande le vérifie et le conserve normalisé", async () => {
    const src = await source();
    const bloc = src.slice(
      src.indexOf("export async function requestRouterTransfer"),
      src.indexOf("export async function cancelRouterTransfer"),
    );
    assert.match(bloc, /guardDeclaredSerial\(/);
    assert.match(bloc, /serialNumber: normalizeSerial\(serialDeclare\)/);
  });

  it("la propriété est vérifiée AVANT la comparaison du numéro", async () => {
    /* Sinon un compte étranger apprendrait par tâtonnement le numéro de série
       d'un routeur qui ne lui appartient pas : l'erreur « ne correspond pas »
       est un oracle. */
    const src = await source();
    const bloc = src.slice(
      src.indexOf("export async function requestRouterTransfer"),
      src.indexOf("export async function cancelRouterTransfer"),
    );
    assert.ok(
      bloc.indexOf("guardTransferRequest(") < bloc.indexOf("guardDeclaredSerial("),
      "la propriété doit être tranchée en premier",
    );
  });

  it("le superadmin voit le numéro déclaré dans sa file", async () => {
    const src = await source();
    assert.match(src, /serialNumber: routerTransferRequests\.serialNumber/);
    const vue = await readFile(
      new URL("../../app/admin/router-transfers/TransfersManager.tsx", import.meta.url),
      "utf8",
    );
    assert.match(vue, /d\.serialNumber/);
    assert.match(vue, /name="serialNumber"[\s\S]{0,80}required/);
  });
});
