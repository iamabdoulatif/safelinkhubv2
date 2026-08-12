import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ensureMikhmonTunnelAccess } from "./mikhmon-tunnel-access";

describe("MikHmon tunnel access repair", () => {
  it("skips tunnel firewall rules for tunnel interfaces that do not exist on the router", async () => {
    const calls: string[][] = [];
    const client = {
      async talk(words: string[]) {
        calls.push(words);
        if (words[0] === "/ip/address/print") return [];
        if (words[0] === "/interface/bridge/port/print") return [];
        if (words[0] === "/interface/bridge/print") return [];
        if (words[0] === "/ip/firewall/nat/print") return [{ ".id": "*nat" }];
        if (words[0] === "/interface/print") {
          return words.includes("?name=safelinkhub-wg0") ? [{ ".id": "*wg" }] : [];
        }
        if (words[0] === "/ip/firewall/filter/print" && words.some((word) => word.startsWith("?comment="))) {
          return [];
        }
        if (words[0] === "/ip/firewall/filter/print") return [{ ".id": "*first" }];
        if (words[0] === "/ip/firewall/filter/add") {
          if (words.includes("=in-interface=safelinkhub-ovpn")) {
            throw new Error("input does not match any value of interface");
          }
          return [];
        }
        return [];
      },
    };

    await ensureMikhmonTunnelAccess(client as never);

    const addedFirewallRules = calls.filter((words) => words[0] === "/ip/firewall/filter/add");
    assert.equal(addedFirewallRules.length, 1);
    assert.ok(addedFirewallRules[0].includes("=in-interface=safelinkhub-wg0"));
    assert.ok(!addedFirewallRules[0].includes("=in-interface=safelinkhub-ovpn"));
  });

  /**
   * Routeur type SHIA-HSPT : MikHmon est bien installé, mais dans un conteneur
   * qui n'est pas celui de SafeLinkHub — donc sur une autre veth, à une autre
   * adresse. La règle codée en dur sur 11.11.11.11 envoyait le trafic dans le
   * vide et l'accès distant expirait sans un mot.
   */
  function routerWithForeignMikhmon(opts: { existingNat?: Record<string, string> } = {}) {
    const calls: string[][] = [];
    const client = {
      async talk(words: string[]) {
        calls.push(words);
        if (words[0] === "/container/print") {
          return [
            { ".id": "*1", name: "web-panel", interface: "veth-web", status: "running" },
            { ".id": "*2", name: "mikhmon", interface: "veth-hmon", status: "running" },
          ];
        }
        if (words[0] === "/interface/veth/print") {
          if (words.includes("?name=veth-hmon")) return [{ ".id": "*v", address: "172.20.0.5/24" }];
          return [];
        }
        if (words[0] === "/ip/firewall/nat/print") return opts.existingNat ? [opts.existingNat] : [];
        if (words[0] === "/interface/print") {
          return words.includes("?name=safelinkhub-wg0") ? [{ ".id": "*wg" }] : [];
        }
        if (words[0] === "/ip/firewall/filter/print" && words.some((w) => w.startsWith("?comment="))) return [];
        if (words[0] === "/ip/firewall/filter/print") return [{ ".id": "*first" }];
        return [];
      },
    };
    return { calls, client };
  }

  it("vise l'adresse RÉELLE du conteneur MikHmon, pas la veth SafeLinkHub", async () => {
    const { calls, client } = routerWithForeignMikhmon();
    await ensureMikhmonTunnelAccess(client as never);

    const nat = calls.find((w) => w[0] === "/ip/firewall/nat/add");
    assert.ok(nat, "le dst-nat doit être créé");
    assert.ok(nat.includes("=to-addresses=172.20.0.5"), "il doit viser le conteneur trouvé");
    assert.ok(!nat.includes("=to-addresses=11.11.11.11"), "et surtout pas l'adresse supposée");

    const filter = calls.find((w) => w[0] === "/ip/firewall/filter/add");
    assert.ok(filter?.includes("=dst-address=172.20.0.5"), "le filtre doit suivre la même adresse");
  });

  it("redresse une règle existante qui visait la mauvaise adresse", async () => {
    // C'est le cas de réparation : la règle EXISTE (donc l'ancien code passait
    // son chemin) mais pointe là où personne n'écoute.
    const { calls, client } = routerWithForeignMikhmon({
      existingNat: { ".id": "*nat", "to-addresses": "11.11.11.11" },
    });
    await ensureMikhmonTunnelAccess(client as never);

    const retarget = calls.find((w) => w[0] === "/ip/firewall/nat/set");
    assert.ok(retarget, "une règle mal dirigée doit être corrigée, pas ignorée");
    assert.ok(retarget.includes("=numbers=*nat"));
    assert.ok(retarget.includes("=to-addresses=172.20.0.5"));
  });

  it("ne touche à rien quand la règle vise déjà le bon conteneur", async () => {
    const { calls, client } = routerWithForeignMikhmon({
      existingNat: { ".id": "*nat", "to-addresses": "172.20.0.5" },
    });
    await ensureMikhmonTunnelAccess(client as never);
    assert.equal(calls.filter((w) => w[0] === "/ip/firewall/nat/set").length, 0);
    assert.equal(calls.filter((w) => w[0] === "/ip/firewall/nat/add").length, 0);
  });

  it("garde l'adresse par défaut quand aucun conteneur ne ressemble à MikHmon", async () => {
    // Prudence : on n'expose pas publiquement un conteneur quelconque au
    // prétexte qu'il serait le seul présent.
    const calls: string[][] = [];
    const client = {
      async talk(words: string[]) {
        calls.push(words);
        if (words[0] === "/container/print") {
          return [{ ".id": "*1", name: "autre-appli", interface: "veth-x", status: "running" }];
        }
        if (words[0] === "/interface/veth/print") return [{ address: "10.9.9.9/24" }];
        if (words[0] === "/ip/firewall/nat/print") return [];
        if (words[0] === "/interface/print") return [];
        if (words[0] === "/ip/firewall/filter/print") return [];
        return [];
      },
    };
    await ensureMikhmonTunnelAccess(client as never);

    const nat = calls.find((w) => w[0] === "/ip/firewall/nat/add");
    assert.ok(nat?.includes("=to-addresses=11.11.11.11"));
    assert.ok(!nat?.includes("=to-addresses=10.9.9.9"));
  });
});
