import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  apiGroupPolicyCommand,
  ensureApiGroupPolicy,
  missingApiGroupPolicies,
  REQUIRED_API_GROUP_POLICIES,
} from "./router-audit-fixes";
import { WIFI_ENABLE_ANY_VERSION } from "./provisioning-commands";

describe("missingApiGroupPolicies", () => {
  it("signale « policy » manquant sur un groupe pré-correctif (cas HSPT-LEGRAND)", () => {
    const before =
      "ssh,ftp,read,write,test,sensitive,api,!local,!telnet,!reboot,!policy,!winbox,!password,!web,!sniff,!romon,!rest-api";
    assert.deepEqual(missingApiGroupPolicies(before), ["policy"]);
  });

  it("ne signale rien quand toutes les permissions requises sont actives", () => {
    const after = "ssh,ftp,read,write,policy,test,sensitive,api,!local,!telnet";
    assert.deepEqual(missingApiGroupPolicies(after), []);
  });

  it("ignore les permissions désactivées (préfixe !) et compte comme manquantes", () => {
    // policy présent mais NIÉ → doit compter comme manquant.
    assert.ok(missingApiGroupPolicies("read,write,!policy,api").includes("policy"));
  });

  it("traite un champ vide/indéfini comme tout manquant", () => {
    assert.deepEqual(missingApiGroupPolicies(""), [...REQUIRED_API_GROUP_POLICIES]);
    assert.deepEqual(missingApiGroupPolicies(undefined), [...REQUIRED_API_GROUP_POLICIES]);
  });

  it("exige bien « policy » (permission clé pour l'expiration/revenu MikHmon)", () => {
    assert.ok(REQUIRED_API_GROUP_POLICIES.includes("policy"));
  });
});

describe("WIFI_ENABLE_ANY_VERSION (compat RouterOS 7.9 → 7.23.x)", () => {
  it("couvre les trois chemins de menu WiFi", () => {
    assert.ok(WIFI_ENABLE_ANY_VERSION.includes("/interface/wifi/set"));
    assert.ok(WIFI_ENABLE_ANY_VERSION.includes("/interface/wifiwave2/set"));
    assert.ok(WIFI_ENABLE_ANY_VERSION.includes("/interface/wireless/set"));
  });

  it("enveloppe chaque variante dans :do{}on-error={} et la [:parse] au runtime", () => {
    // Un chemin de menu inexistant échoue au PARSE : seul un :parse au runtime
    // rend l'erreur rattrapable par on-error (sinon toute la ligne collée est
    // avortée, VPN compris). On vérifie les 3 gardes.
    const guards = WIFI_ENABLE_ANY_VERSION.match(/:do \{:local c \[:parse/g) ?? [];
    assert.equal(guards.length, 3);
    assert.equal((WIFI_ENABLE_ANY_VERSION.match(/on-error=\{\}/g) ?? []).length, 3);
  });
});


describe("le compte de service ne peut pas s'accorder « policy » lui-même", () => {
  const GROUPE_INCOMPLET = {
    ".id": "*1",
    policy: "ssh,ftp,read,write,test,sensitive,api,!policy",
  };
  /** Client minimal : rend le groupe en lecture, refuse l'écriture. */
  function clientQuiRefuse() {
    const appels: string[][] = [];
    return {
      appels,
      async talk(words: string[]) {
        appels.push(words);
        if (words[0] === "/user/group/print") return [GROUPE_INCOMPLET];
        // Le mot exact de RouterOS, mesuré sur HSPT-FOUANGA le 2026-09-04.
        throw new Error("not enough permissions (9)");
      },
    };
  }

  it("rend « refusé » au lieu de propager une erreur RouterOS brute", async () => {
    const client = clientQuiRefuse();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await ensureApiGroupPolicy(client as any);
    assert.deepEqual(res, { found: true, missing: ["policy"], applied: false, refused: true });
  });

  it("la commande de secours accorde exactement les permissions requises", () => {
    const cmd = apiGroupPolicyCommand();
    assert.match(cmd, /^\/user group set safelinkhub-group policy=/);
    for (const p of REQUIRED_API_GROUP_POLICIES) assert.ok(cmd.includes(p), `« ${p} » absente`);
  });

  it("une autre panne d'écriture remonte telle quelle", async () => {
    const client = {
      async talk(words: string[]) {
        if (words[0] === "/user/group/print") return [GROUPE_INCOMPLET];
        throw new Error("Read timed out");
      },
    };
    await assert.rejects(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      () => ensureApiGroupPolicy(client as any),
      /Read timed out/,
    );
  });
});
