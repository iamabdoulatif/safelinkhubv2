import test from "node:test";
import assert from "node:assert/strict";
import { groupeOuvert } from "./admin-nav";

test("sans choix manuel, c'est le groupe de la page courante qui s'ouvre", () => {
  assert.equal(
    groupeOuvert({ groupeActif: "network", choix: null, chemin: "/admin/router" }),
    "network",
  );
  assert.equal(groupeOuvert({ groupeActif: null, choix: null, chemin: "/admin" }), null);
});

test("le pli choisi à la main l'emporte sur la même page", () => {
  assert.equal(
    groupeOuvert({
      groupeActif: "network",
      choix: { chemin: "/admin/router", groupe: "finance" },
      chemin: "/admin/router",
    }),
    "finance",
  );
  // Refermer le groupe actif reste possible : on demande null, on obtient null.
  assert.equal(
    groupeOuvert({
      groupeActif: "network",
      choix: { chemin: "/admin/router", groupe: null },
      chemin: "/admin/router",
    }),
    null,
  );
});

test("naviguer périme le pli manuel — le groupe suit la nouvelle page", () => {
  assert.equal(
    groupeOuvert({
      groupeActif: "org",
      choix: { chemin: "/admin/router", groupe: "finance" },
      chemin: "/admin/users",
    }),
    "org",
  );
});
