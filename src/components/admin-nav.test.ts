import test from "node:test";
import assert from "node:assert/strict";
import { groupeOuvert, isNavActive, navTrail } from "./admin-nav";

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

test("une entrée s'allume par segment, pas par préfixe de chaîne", () => {
  // « Routeurs » s'allumait sur « Transferts de routeur ».
  assert.equal(isNavActive("/admin/router", "/admin/router-transfers"), false);
  assert.equal(isNavActive("/admin/router-transfers", "/admin/router-transfers"), true);
  assert.equal(isNavActive("/admin/router", "/admin/router/abc"), true);
  assert.equal(isNavActive("/admin/router", "/admin/router/backups"), false);
  assert.equal(isNavActive("/admin", "/admin/sales"), false);
  assert.equal(isNavActive("/admin/settings/general", "/admin/settings/gateways"), true);
});

test("le fil d'Ariane suit la structure de la barre latérale", () => {
  assert.deepEqual(navTrail("/admin", false), {
    section: null,
    link: { href: "/admin", key: "dashboard" },
    deeper: false,
  });
  const fiche = navTrail("/admin/router/abc", false);
  assert.equal(fiche?.section, "network");
  assert.equal(fiche?.link.key, "routers");
  assert.equal(fiche?.deeper, true, "sous la liste : la page devient un lien de retour");
  assert.equal(navTrail("/admin/router/backups", false)?.link.key, "backups");
  assert.equal(navTrail("/admin/settings/general", false)?.deeper, false);
  // Les pages superadmin n'ont de fil que pour le superadmin.
  assert.equal(navTrail("/admin/kyc", false), null);
  assert.equal(navTrail("/admin/kyc", true)?.section, "superadmin");
});
