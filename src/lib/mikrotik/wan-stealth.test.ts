import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildWanRestorePlan,
  buildWanStealthPlan,
  inspectWanStealth,
  macLocale,
  nomFaiValide,
  type WanStealthInput,
} from "./wan-stealth";

/** État tel que relevé sur HSPT-FOUANGA (hAP ax², deux liens Starlink). */
const FOUANGA: WanStealthInput = {
  links: [
    {
      name: "E1-WAN-FAI",
      ethId: "*1",
      mac: "D0:EA:11:81:09:99",
      origMac: "D0:EA:11:81:09:99",
      dhcpId: "*0",
      dhcpOptions: "hostname,clientid",
      sentHostname: "HSPT-FOUANGA",
    },
    {
      name: "E2-WAN-FAI",
      ethId: "*2",
      mac: "D0:EA:11:81:09:9A",
      origMac: "D0:EA:11:81:09:9A",
      dhcpId: "*1",
      dhcpOptions: "hostname,clientid",
      sentHostname: "HSPT-FOUANGA",
    },
  ],
  discoverList: "static",
  discoverProtocols: "cdp,lldp,mndp",
  cloudDdns: true,
  interfaceLists: ["all", "none", "dynamic", "static", "WAN", "LAN"],
  openServices: ["ssh", "winbox", "www"],
};

describe("inspectWanStealth", () => {
  it("nomme les quatre fuites réelles et n'auto-répare pas les services", () => {
    const leaks = inspectWanStealth(FOUANGA);
    assert.deepEqual(
      leaks.map((l) => l.id),
      ["mac-vendor", "hostname", "discovery", "cloud", "services"],
    );
    assert.deepEqual(leaks[0].interfaces, ["E1-WAN-FAI", "E2-WAN-FAI"]);
    assert.equal(leaks.find((l) => l.id === "services")!.fixable, false);
  });

  it("se tait quand tout est déjà discret", () => {
    const leaks = inspectWanStealth({
      ...FOUANGA,
      links: [
        {
          name: "E1-WAN-FAI",
          ethId: "*1",
          mac: "02:AB:CD:EF:01:02",
          origMac: "D0:EA:11:81:09:99",
          dhcpId: "*0",
          dhcpOptions: "slh-E1-WAN-FAI,clientid",
        },
      ],
      discoverList: "LAN",
      cloudDdns: false,
      openServices: [],
    });
    assert.deepEqual(leaks, []);
  });
});

describe("nomFaiValide", () => {
  it("accepte un nom d'hôte, refuse tout ce qui pourrait clore l'apostrophe", () => {
    assert.ok(nomFaiValide("E1-WAN-FAI"));
    assert.ok(!nomFaiValide("E1'; /system reboot; '"));
    assert.ok(!nomFaiValide("nom avec espace"));
    assert.ok(!nomFaiValide(""));
    assert.ok(!nomFaiValide("x".repeat(33)));
  });
});

describe("macLocale", () => {
  it("rend une MAC localement administrée, stable et sans OUI constructeur", () => {
    const a = macLocale("routeur:E1-WAN-FAI");
    assert.match(a, /^02(:[0-9A-F]{2}){5}$/);
    assert.equal(a, macLocale("routeur:E1-WAN-FAI"));
    assert.notEqual(a, macLocale("routeur:E2-WAN-FAI"));
  });
});

describe("buildWanStealthPlan", () => {
  const opts = { label: "E1-WAN-FAI", spoofMac: true, seed: "r1", existingOptions: [] };

  it("coupe la découverte et le DDNS, renomme, et garde la MAC pour la fin", () => {
    const steps = buildWanStealthPlan(FOUANGA, opts);
    const cmds = steps.map((s) => s.words[0]);
    assert.equal(cmds[0], "/ip/neighbor/discovery-settings/set");
    assert.equal(cmds[1], "/ip/cloud/set");
    // La MAC (et le renouvellement du bail) ne viennent qu'après le reste :
    // elles coupent le WAN, donc le tunnel par lequel on parle au routeur.
    const premiereMac = cmds.indexOf("/interface/ethernet/set");
    assert.ok(premiereMac > cmds.indexOf("/ip/dhcp-client/set"));
    assert.equal(steps[0].words[1], "=discover-interface-list=LAN");
  });

  it("pose l'option 12 par interface et la réutilise si elle existe déjà", () => {
    const neuf = buildWanStealthPlan(FOUANGA, opts);
    assert.ok(
      neuf.some(
        (s) =>
          s.words[0] === "/ip/dhcp-client/option/add" &&
          s.words.includes("=name=slh-E1-WAN-FAI") &&
          s.words.includes("=code=12") &&
          s.words.includes("=value='E1-WAN-FAI'"),
      ),
    );
    const rejoue = buildWanStealthPlan(FOUANGA, {
      ...opts,
      existingOptions: [{ name: "slh-E1-WAN-FAI", id: "*3" }],
    });
    assert.ok(
      rejoue.some(
        (s) => s.words[0] === "/ip/dhcp-client/option/set" && s.words[1] === "=numbers=*3",
      ),
    );
    assert.ok(!rejoue.some((s) => s.words.includes("=name=slh-E1-WAN-FAI")));
  });

  it("refuse un nom invalide plutôt que de l'injecter dans la commande", () => {
    const steps = buildWanStealthPlan(FOUANGA, { ...opts, label: "mauvais'nom" });
    assert.ok(!steps.some((s) => s.words[0].startsWith("/ip/dhcp-client/option")));
  });

  it("sans spoofMac, aucune MAC n'est touchée", () => {
    const steps = buildWanStealthPlan(FOUANGA, { ...opts, spoofMac: false });
    assert.ok(!steps.some((s) => s.words[0] === "/interface/ethernet/set"));
  });

  it("ne rejoue rien quand le routeur est déjà discret", () => {
    const deja: WanStealthInput = {
      ...FOUANGA,
      links: [
        {
          name: "E1-WAN-FAI",
          ethId: "*1",
          mac: macLocale("r1:E1-WAN-FAI"),
          origMac: "D0:EA:11:81:09:99",
          dhcpId: "*0",
          dhcpOptions: "slh-E1-WAN-FAI,clientid",
        },
      ],
      discoverList: "LAN",
      cloudDdns: false,
    };
    const steps = buildWanStealthPlan(deja, {
      ...opts,
      existingOptions: [{ name: "slh-E1-WAN-FAI", id: "*3" }],
    });
    // Seul le nom est reposé (idempotent) ; ni MAC, ni découverte, ni cloud.
    assert.deepEqual(
      steps.map((s) => s.words[0]),
      ["/ip/dhcp-client/option/set", "/ip/dhcp-client/set"],
    );
  });
});

describe("buildWanRestorePlan", () => {
  it("remet la MAC d'usine et le nom d'hôte système", () => {
    const masque: WanStealthInput = {
      ...FOUANGA,
      links: [
        {
          name: "E1-WAN-FAI",
          ethId: "*1",
          mac: "02:AB:CD:EF:01:02",
          origMac: "D0:EA:11:81:09:99",
          dhcpId: "*0",
          dhcpOptions: "slh-E1-WAN-FAI,clientid",
        },
      ],
    };
    const steps = buildWanRestorePlan(masque);
    assert.deepEqual(
      steps.map((s) => s.words[0]),
      ["/ip/dhcp-client/set", "/interface/ethernet/set", "/ip/dhcp-client/renew"],
    );
    assert.ok(steps[1].words.includes("=mac-address=D0:EA:11:81:09:99"));
  });

  it("ne fait rien sur un routeur resté d'usine", () => {
    assert.deepEqual(buildWanRestorePlan(FOUANGA), []);
  });
});
