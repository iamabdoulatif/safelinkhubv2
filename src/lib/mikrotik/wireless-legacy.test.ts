import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import {
  commandeSsidLegacy,
  estRadio5Ghz,
  LEGACY_COUNTRY_DEFAUT,
  utiliserPiloteHerite,
} from "./wireless-legacy";

const val = (cmd: string[], cle: string) =>
  cmd.find((c) => c.startsWith(`=${cle}=`))?.slice(cle.length + 2);

describe("quel pilote Wi-Fi utiliser", () => {
  it("le paquet wifi prime dès qu'il existe — cartes ARM et ARM64", () => {
    assert.equal(utiliserPiloteHerite([{ name: "wifi1" }], [{ name: "wlan1" }]), false);
    assert.equal(utiliserPiloteHerite([{ name: "wifi1" }], []), false);
  });

  it("sans menu wifi, on bascule sur le pilote hérité", () => {
    // C'est le cas du RB951 : /interface/wifi/print renvoie une liste vide.
    assert.equal(utiliserPiloteHerite([], [{ name: "wlan1" }]), true);
  });

  it("une carte SANS radio du tout ne déclenche rien", () => {
    // hEX, CCR… : aucun des deux menus ne doit être sollicité.
    assert.equal(utiliserPiloteHerite([], []), false);
  });
});

describe("commande de SSID sur le pilote hérité", () => {
  it("reprend la configuration relevée sur un RB951 en service", () => {
    /* Valeurs comparées à une configuration RouterOS 7.24.1 fournie par
       l'exploitant, où le Wi-Fi fonctionne — pas composées d'après la doc. */
    const cmd = commandeSsidLegacy({ name: "wlan1" }, "MOULOUK WIFI");
    assert.equal(val(cmd, "ssid"), "MOULOUK WIFI");
    assert.equal(val(cmd, "mode"), "ap-bridge");
    assert.equal(val(cmd, "band"), "2ghz-b/g/n");
    assert.equal(val(cmd, "channel-width"), "20/40mhz-XX");
    assert.equal(val(cmd, "frequency"), "auto");
    assert.equal(val(cmd, "frequency-mode"), "manual-txpower");
    assert.equal(val(cmd, "wps-mode"), "disabled");
    assert.equal(val(cmd, "disabled"), "no");
    assert.equal(cmd[0], "/interface/wireless/set");
  });

  it("n'emploie AUCUNE propriété du paquet wifi", () => {
    /* `/interface/wireless/set` est atomique : un seul paramètre inconnu fait
       rejeter la commande entière, SSID compris. C'est précisément le piège
       qui laissait la radio sur « MikroTik ». */
    const cmd = commandeSsidLegacy({ name: "wlan1" }, "ZONE");
    for (const interdit of ["configuration.", "channel.", "=mode=ap\0"]) {
      assert.ok(
        !cmd.some((c) => c.includes(interdit)),
        `propriété du paquet wifi employée : ${interdit}`,
      );
    }
    // `ap` seul n'existe pas sur le pilote hérité — ce doit être `ap-bridge`.
    assert.notEqual(val(cmd, "mode"), "ap");
  });

  it("allume la radio DANS la même commande que le SSID", () => {
    // En deux temps, une radio pouvait s'allumer en gardant l'ancien nom.
    const cmd = commandeSsidLegacy({ name: "wlan1" }, "ZONE");
    assert.ok(cmd.includes("=disabled=no"));
    assert.ok(cmd.includes("=ssid=ZONE"));
  });

  it("le pays reste celui du pilote hérité, jamais « United States »", () => {
    /* Le paquet wifi accepte « United States » ; le pilote hérité attend un
       identifiant en minuscules et refuse tout le reste avec. */
    assert.equal(val(commandeSsidLegacy({ name: "wlan1" }, "Z"), "country"), LEGACY_COUNTRY_DEFAUT);
    assert.notEqual(val(commandeSsidLegacy({ name: "wlan1" }, "Z"), "country"), "United States");
  });

  it("une radio 5 GHz reçoit sa bande, pas celle des 2,4", () => {
    const cmd = commandeSsidLegacy({ name: "wlan2", band: "5ghz-a/n/ac" }, "Z");
    assert.equal(val(cmd, "band"), "5ghz-a/n/ac");
    assert.equal(estRadio5Ghz({ name: "wlan2", band: "5ghz-a/n/ac" }), true);
    assert.equal(estRadio5Ghz({ name: "wlan1", band: "2ghz-b/g/n" }), false);
  });
});

describe("cartes sans conteneur", () => {
  it("ni veth ni bridge DOCKERS ne sont posés", async () => {
    /* Ces menus n'existent pas sur une carte MIPS. Le garde-fou est que tout
       le bloc vit sous `if (containerPackageReady)`, lui-même initialisé
       depuis `supportsContainers` — vérifié sur la source, l'exécuter
       demanderait un vrai routeur. */
    const src = await readFile(new URL("./container-setup.ts", import.meta.url), "utf8");
    const debut = src.indexOf("if (containerPackageReady) {");
    assert.ok(debut > 0, "le garde-fou a disparu");
    const avant = src.slice(0, debut);
    assert.ok(!avant.includes("/interface/veth/add"), "veth créée hors du garde-fou");
    assert.ok(
      !avant.includes(`"/interface/bridge/add", \`=name=${"$"}{DOCKER_BRIDGE_NAME}\``),
      "bridge DOCKERS créé hors du garde-fou",
    );
    assert.match(src, /let containerPackageReady = opts\.supportsContainers;/);
  });
});

describe("la radio héritée rejoint le bridge du hotspot", () => {
  const source = () =>
    readFile(new URL("./container-setup.ts", import.meta.url), "utf8");

  it("wlan1 est recensé parmi les ports du bridge", async () => {
    /* Sans lui, le SSID est correct, les clients s'associent — et n'atteignent
       jamais le portail. La panne ressemble alors à un portail cassé plutôt
       qu'à un port manquant. */
    const s = await source();
    const bloc = s.slice(s.indexOf("const lanPorts = ["), s.indexOf("const lanPorts = [") + 600);
    assert.match(bloc, /wirelessLanRows\.map/, "les radios héritées ne sont pas dans lanPorts");
  });

  it("le SSID hérité est posé APRÈS la boucle du paquet wifi", async () => {
    // L'ordre porte la priorité : le paquet wifi d'abord, le pilote hérité
    // seulement s'il n'a rien trouvé.
    const s = await source();
    // `indexOf("utiliserPiloteHerite")` seul tombe sur l'IMPORT en tête de
    // fichier : on vise le site d'appel, qui porte sa parenthèse.
    const appel = s.indexOf("utiliserPiloteHerite(");
    assert.ok(appel > 0, "le pilote hérité n'est jamais appelé");
    assert.ok(
      s.indexOf('"/interface/wifi/set"') < appel,
      "le pilote hérité passe avant le paquet wifi",
    );
  });
});

describe("le conteneur n'est pas attendu partout", () => {
  it("arm, arm64 et tile l'acceptent ; MIPS et PowerPC non", async () => {
    const { architectureAccepteConteneur } = await import("./wireless-legacy");
    for (const a of ["arm", "arm64", "tile", "ARM64", " arm "]) {
      assert.equal(architectureAccepteConteneur(a), true, a);
    }
    for (const a of ["mipsbe", "mmips", "smips", "powerpc", "ppc", "", null, undefined]) {
      assert.equal(architectureAccepteConteneur(a), false, String(a));
    }
  });

  it("une carte MIPS est déclarée CONFORME, pas en échec", async () => {
    /* C'est le cœur du problème vu à l'écran : « Conteneur MikHmon ✗ » et un
       bouton « Continuer l'auto-setup » qui ne pouvait rien réparer. */
    const { readFile } = await import("node:fs/promises");
    const src = await readFile(new URL("./config-audit.ts", import.meta.url), "utf8");
    const bloc = src.slice(src.indexOf("const conteneurPossible"));
    assert.match(bloc, /if \(!conteneurPossible\)[\s\S]{0,200}status: "ok"/);
    // Et la décision précède l'ancien test d'absence, sinon elle ne sert à rien.
    assert.ok(
      src.indexOf("const conteneurPossible") < src.indexOf('status: "missing"\n        detail:') ||
        src.indexOf("!conteneurPossible") < src.indexOf("container.length === 0"),
      "l'architecture est consultée trop tard",
    );
  });
});

describe("le bridge DOCKERS n'est plus posé sur les cartes MIPS", () => {
  const script = async () => {
    const { readFile } = await import("node:fs/promises");
    return readFile(
      new URL("../../app/api/router/v1/[slug]/scripts/install-vpn/route.ts", import.meta.url),
      "utf8",
    );
  };

  it("la capacité est lue SUR LE ROUTEUR, pas décidée par le serveur", async () => {
    /* Ce script s'exécute à l'enrôlement, avant toute détection : le serveur
       ne connaît pas encore l'architecture. */
    const s = await script();
    assert.match(s, /:local slhArch \[\/system resource get architecture-name\]/);
    assert.match(s, /slhContainerCapable \(\$slhArch = "arm" \|\| \$slhArch = "arm64" \|\| \$slhArch = "tile"\)/);
  });

  it("la création du bridge est conditionnée", async () => {
    // C'était la ligne fautive : un bridge existe sur TOUTES les cartes, donc
    // la commande réussissait là où la veth échouait en silence.
    const s = await script();
    assert.match(s, /:if \(\$slhContainerCapable\) do=\{ :if \(\[:len \[\/interface bridge find where name="DOCKERS"\]\] = 0\)/);
  });

  it("un bridge posé par une ancienne version est RETIRÉ", async () => {
    // Sans cela, les routeurs déjà enrôlés gardent l'objet inutile.
    const s = await script();
    const bloc = s.slice(s.indexOf("} else={"), s.indexOf("} else={") + 400);
    assert.match(bloc, /\/interface bridge remove \[find name="DOCKERS"\]/);
  });
});
