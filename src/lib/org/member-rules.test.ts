import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import { can, isMemberRole, isRole, ROLES } from "@/lib/auth/roles";
import { guardAssignRole, guardChangeRole, guardInvite, guardRemoveMember } from "./member-rules";

describe("rôles et capacités", () => {
  it("un rôle ne s'attribue jamais « superadmin »", () => {
    /* Le superadmin voit TOUTES les organisations du SaaS. Si un administrateur
       d'organisation pouvait se l'attribuer — ou l'attribuer — en postant la
       chaîne à la main, il s'ouvrirait le parc de tous les autres clients. */
    assert.equal(guardAssignRole("superadmin").ok, false);
    assert.equal(guardAssignRole("owner").ok, false);
    assert.equal(guardAssignRole("").ok, false);
    for (const r of ROLES) assert.equal(guardAssignRole(r.id).ok, true, r.id);
    assert.equal(isRole("superadmin"), false, "superadmin n'est pas dans ROLES");
  });

  it("refus par défaut : le lecteur ne peut rien écrire", () => {
    for (const capacite of ["members", "billing", "settings", "routers", "packages", "tickets"] as const) {
      assert.equal(can("viewer", capacite), false, capacite);
    }
    // …mais il entre bien dans l'administration, en consultation.
    assert.equal(isMemberRole("viewer"), true);
  });

  it("chaque rôle s'arrête où on l'a dit", () => {
    assert.equal(can("editor", "routers"), true);
    assert.equal(can("editor", "tickets"), true);
    assert.equal(can("editor", "packages"), true);
    assert.equal(can("editor", "billing"), false, "un éditeur ne touche pas à l'argent");
    assert.equal(can("editor", "members"), false, "ni aux membres");
    assert.equal(can("editor", "settings"), false);

    assert.equal(can("sales_agent", "tickets"), true);
    assert.equal(can("sales_agent", "routers"), false, "l'agent vend, il ne configure pas");
    assert.equal(can("sales_agent", "packages"), false);

    assert.equal(can("admin", "members"), true);
    assert.equal(can("superadmin", "settings"), true);
  });

  it("un rôle inconnu n'ouvre rien du tout", () => {
    assert.equal(isMemberRole("owner"), false);
    assert.equal(isMemberRole(undefined), false);
    assert.equal(can("owner", "tickets"), false);
    assert.equal(can(undefined, "tickets"), false);
  });
});

describe("garde-fous d'appartenance", () => {
  const base = { actorUserId: "a", targetUserId: "b", adminCount: 2 };

  it("interdit de se retirer soi-même", () => {
    const v = guardRemoveMember({ ...base, targetUserId: "a", targetRole: "admin" });
    assert.equal(v.ok, false);
  });

  it("interdit de retirer le DERNIER administrateur", () => {
    /* Sinon l'organisation se retrouve sans personne capable d'inviter, de
       payer ou de changer les réglages — et sans moyen de revenir en arrière. */
    const v = guardRemoveMember({ ...base, targetRole: "admin", adminCount: 1 });
    assert.equal(v.ok, false);
    assert.equal(guardRemoveMember({ ...base, targetRole: "editor", adminCount: 1 }).ok, true);
  });

  it("interdit de rétrograder le dernier administrateur", () => {
    const v = guardChangeRole({
      ...base,
      currentRole: "admin",
      nextRole: "viewer",
      adminCount: 1,
    });
    assert.equal(v.ok, false);
    assert.equal(
      guardChangeRole({ ...base, currentRole: "admin", nextRole: "viewer", adminCount: 2 }).ok,
      true,
    );
  });

  it("interdit de changer son propre rôle", () => {
    const v = guardChangeRole({
      ...base,
      targetUserId: "a",
      currentRole: "admin",
      nextRole: "viewer",
    });
    assert.equal(v.ok, false);
  });

  it("refuse une invitation en double ou vers un membre existant", () => {
    const membres = ["deja@exemple.com"];
    const ouvertes = ["invite@exemple.com"];
    assert.equal(
      guardInvite({ email: "DEJA@exemple.com", role: "editor", membresExistants: membres, invitationsOuvertes: [] }).ok,
      false,
      "la comparaison ignore la casse",
    );
    assert.equal(
      guardInvite({ email: "invite@exemple.com", role: "editor", membresExistants: [], invitationsOuvertes: ouvertes }).ok,
      false,
    );
    const bonne = guardInvite({
      email: "  Nouveau@Exemple.COM ",
      role: "editor",
      membresExistants: membres,
      invitationsOuvertes: ouvertes,
    });
    assert.equal(bonne.ok, true);
    assert.equal(bonne.email, "nouveau@exemple.com", "l'adresse est normalisée avant stockage");
  });
});

describe("les actions membres sont gardées par la CAPACITÉ", () => {
  it("aucune ne se contente d'une session", async () => {
    /* Une action de gestion des membres protégée par `getSession()` seul serait
       ouverte à un Lecteur : toute fonction exportée d'un module "use server"
       est un endpoint HTTP. */
    const src = await readFile(new URL("./member-actions.ts", import.meta.url), "utf8");
    const exportees = [...src.matchAll(/export async function (\w+)/g)].map((m) => m[1]);
    for (const nom of ["inviteMember", "revokeInvitation", "changeMemberRole", "removeMember"]) {
      assert.ok(exportees.includes(nom), `${nom} manquante`);
      const bloc = src.slice(src.indexOf(`export async function ${nom}`));
      const fin = bloc.indexOf("\nexport ", 1);
      assert.match(
        fin === -1 ? bloc : bloc.slice(0, fin),
        /requireCapability\("members"\)/,
        `${nom} doit exiger la capacité members`,
      );
    }
  });

  it("l'organisation vient de la SESSION, jamais du formulaire", async () => {
    const src = await readFile(new URL("./member-actions.ts", import.meta.url), "utf8");
    assert.doesNotMatch(src, /formData\.get\("orgId"\)/);
    assert.match(src, /eq\(users\.orgId, session\.orgId\)/);
  });
});
