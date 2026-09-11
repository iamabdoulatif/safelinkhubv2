import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  QUOTA_GUARD_NAME,
  QUOTA_GUARD_QUEUE_NAME,
  buildGuardInstallPlan,
  buildGuardRemovalPlan,
  buildGuardRosScript,
  quotaGuardCapLabel,
  renderGuardScript,
  renderGuardStep,
  type GuardStep,
} from "./quota-guard";

const OPTS = { wanInterface: "ether1", capMb: 3 * 1024 * 1024, throttleKbps: 10_000, intervalMinutes: 15 };

const adds = (plan: ReturnType<typeof buildGuardInstallPlan>) =>
  plan.steps.filter((s): s is Extract<GuardStep, { kind: "add" }> => s.kind === "add");

describe("buildGuardRosScript", () => {
  const script = buildGuardRosScript(OPTS);

  it("est une seule ligne (console RouterOS)", () => {
    assert.ok(!script.includes("\n"));
  });

  it("encode le quota en octets (3 To = 3 × 1024⁴)", () => {
    assert.ok(script.includes(`:local capBytes ${3 * 1024 ** 4}`));
  });

  it("compte rx + tx de l'interface WAN", () => {
    assert.ok(script.includes('rx-byte] + [/interface get [find name=$ifname] tx-byte]'));
  });

  it("réaligne au reboot (compteur reparti à zéro : cur < base)", () => {
    assert.ok(script.includes("$cur < $slhQuotaBase"));
  });

  it("détecte le changement de mois par les 3 premiers caractères de la date", () => {
    assert.ok(script.includes("[:pick [/system clock get date] 0 3]"));
  });

  it("coupe et rétablit le fasttrack SafeLinkHub", () => {
    assert.ok(script.includes('comment~"^SafeLinkHub fasttrack"'));
    assert.ok(script.includes("disabled=yes"));
    assert.ok(script.includes("disabled=no"));
  });
});

describe("buildGuardInstallPlan", () => {
  const plan = buildGuardInstallPlan(OPTS);

  it("purge d'abord script, scheduler et file (idempotence)", () => {
    const retraits = plan.steps.filter((s) => s.kind === "remove-where");
    assert.equal(retraits.length, 3);
    assert.deepEqual(
      retraits.map((s) => (s.kind === "remove-where" ? s.path : "")),
      ["/system/scheduler", "/system/script", "/queue/simple"],
    );
  });

  it("pose la file, le script et le scheduler", () => {
    const poses = adds(plan);
    assert.equal(poses.length, 3);
    assert.deepEqual(
      poses.map((s) => s.path),
      ["/queue/simple", "/system/script", "/system/scheduler"],
    );
  });

  it("crée la file désactivée, ciblant l'interface WAN", () => {
    const file = adds(plan)[0];
    assert.equal(file.params.name, QUOTA_GUARD_QUEUE_NAME);
    assert.equal(file.params.target, "ether1");
    assert.equal(file.params.disabled, "yes");
    assert.equal(file.params["max-limit"], "10000k/10000k");
  });

  it("programme le scheduler en startup + intervalle", () => {
    const sched = adds(plan)[2];
    assert.equal(sched.params.name, QUOTA_GUARD_NAME);
    assert.equal(sched.params["start-time"], "startup");
    assert.equal(sched.params.interval, "15m");
    assert.equal(sched.params["on-event"], QUOTA_GUARD_NAME);
  });

  it("garde le script posé identique au renderer", () => {
    assert.equal(adds(plan)[1].params.source, plan.rosScript);
  });

  it("borne l'intervalle à 1 minute minimum", () => {
    const serré = buildGuardInstallPlan({ ...OPTS, intervalMinutes: 0 });
    assert.equal(adds(serré)[2].params.interval, "1m");
  });
});

describe("buildGuardRemovalPlan", () => {
  it("ne retire que nos trois ressources, par nom", () => {
    const plan = buildGuardRemovalPlan();
    assert.equal(plan.steps.length, 3);
    for (const s of plan.steps) {
      assert.equal(s.kind, "remove-where");
      if (s.kind === "remove-where") {
        assert.equal(s.field, "name");
        assert.equal(s.value, QUOTA_GUARD_NAME);
      }
    }
  });
});

describe("renderGuardScript", () => {
  const rsc = renderGuardScript(buildGuardInstallPlan(OPTS));

  it("enveloppe chaque étape dans un parse protégé", () => {
    const lignes = rsc.split("\n").filter((l) => l.startsWith(":do {"));
    // 3 purges + 3 poses.
    assert.equal(lignes.length, 6);
  });

  it("échappe le $ du script source pour la console", () => {
    // Le source du script interne contient des variables $cur, $ifname… :
    // rendu pour la console, chaque $ doit être protégé \$ pour ne pas être
    // interpolé par le :parse externe.
    const ligneFile = rsc.split("\n").find((l) => l.includes("/system script add"));
    assert.ok(ligneFile);
    // Un $ échappé (\$) reste bien sûr visible : ce qu'on vérifie, c'est
    // qu'aucun $ N'ÉCHAPPÉ ne subsiste (il serait interpolé par le :parse).
    assert.ok(!/(^|[^\\])\$cur/.test(ligneFile!), "les $ du source doivent être échappés");
    assert.ok(ligneFile!.includes("\\$"), "les $ du source doivent être échappés");
  });

  it("génère un script de dépose aussi", () => {
    const un = renderGuardScript(buildGuardRemovalPlan());
    assert.ok(un.includes("/system scheduler remove"));
    assert.ok(un.includes("/system script remove"));
    assert.ok(un.includes("/queue simple remove"));
  });
});

describe("renderGuardStep", () => {
  it("écrit les chemins en forme console", () => {
    assert.equal(
      renderGuardStep({ kind: "remove-where", path: "/queue/simple", field: "name", value: QUOTA_GUARD_NAME }),
      "/queue simple remove [find name=safelinkhub-quota-guard]",
    );
  });
});

describe("quotaGuardCapLabel", () => {
  it("lit les To ronds", () => {
    assert.equal(quotaGuardCapLabel(3 * 1024 * 1024), "3 To");
    assert.equal(quotaGuardCapLabel(1024 * 1024), "1 To");
  });
  it("lit les valeurs intermédiaires", () => {
    assert.equal(quotaGuardCapLabel(1536 * 1024), "1,5 To");
    assert.equal(quotaGuardCapLabel(500), "500 Mo");
  });
  it("nullifie l'illimité", () => {
    assert.equal(quotaGuardCapLabel(0), "illimité");
    assert.equal(quotaGuardCapLabel(Number.NaN), "illimité");
  });
});
