import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { provisionCloudMikhmon } from "./mikhmon-cloud";

describe("MikHmon cloud provisioning", () => {
  it("provisionne une instance cloud pour un RB951 sans toucher RouterOS", async () => {
    const commands: string[] = [];

    const instance = await provisionCloudMikhmon({
      router: {
        id: "123e4567-e89b-12d3-a456-426614174000",
        name: "RB951 Korhogo",
        tunnelIp: "10.66.0.23",
        username: "api",
        password: "secret",
        hotspotName: "KORHOGO-WIFI",
        dnsName: "korhogo.ci",
      },
      existing: null,
      usedPorts: [],
      baseDomain: "mikhmon.safelinkhub.io",
      run: async (command) => {
        commands.push(command);
        return "";
      },
    });

    assert.equal(instance.domain, "rb951-korhogo-14174000.mikhmon.safelinkhub.io");
    assert.equal(instance.localPort, 20_000);
    assert.ok(commands.some((command) => command.includes("docker run -d")));
    /* CHAQUE commande docker passe par sudo. Le compte `relay` du relais n'est
       pas dans le groupe docker : sans sudo, l'activation échoue par
       « permission denied … /var/run/docker.sock » — exactement la panne
       remontée en production sur le premier RB951 raccordé. */
    for (const command of commands.filter((c) => c.includes("docker"))) {
      assert.match(command, /^sudo docker /, `commande docker sans sudo : ${command}`);
    }
    assert.ok(
      commands.every(
        (command) => !command.includes("/ip/firewall") && !command.includes("/container/"),
      ),
    );
  });

  it("pose la session MikHmon — l'exploitant ne ressaisit rien", async () => {
    /* Sans cette écriture, MikHmon s'ouvre sur « Nouveau routeur » et réclame
       l'IP, le compte API, le hotspot et le DNS que SafeLinkHub connaît déjà :
       c'est la panne constatée sur le premier RB951 raccordé. */
    const commands: string[] = [];
    await provisionCloudMikhmon({
      router: {
        id: "123e4567-e89b-12d3-a456-426614174000",
        name: "RB951 Korhogo",
        tunnelIp: "10.66.0.48",
        username: "safelinkhub-api",
        password: "s3cr3t",
        hotspotName: "KORHOGO-WIFI",
        dnsName: "korhogo.ci",
      },
      existing: null,
      usedPorts: [],
      baseDomain: "mikhmon.safelinkhub.io",
      run: async (command) => { commands.push(command); return ""; },
    });

    const ecriture = commands.find((c) => c.includes("config.php"));
    assert.ok(ecriture, "aucune écriture de config.php");
    const b64 = /echo ([A-Za-z0-9+/=]+) \| base64 -d/.exec(ecriture!)?.[1];
    assert.ok(b64, "le contenu ne transite pas en base64");
    const php = Buffer.from(b64!, "base64").toString("utf8");

    // L'instance joint le routeur par le TUNNEL, jamais par l'adresse du
    // hotspot : celle-ci n'est pas routable depuis le relais.
    assert.match(php, /SafeLinkHub!10\.66\.0\.48/);
    assert.match(php, /SafeLinkHub@\|@safelinkhub-api/);
    assert.match(php, /SafeLinkHub%KORHOGO-WIFI/);
    assert.match(php, /SafeLinkHub\^korhogo\.ci/);
    // Le mot de passe est chiffré, jamais posé en clair dans le fichier.
    assert.ok(!php.includes("s3cr3t"), "mot de passe en clair dans config.php");
    assert.match(php, /SafeLinkHub#\|#\S+/);
  });

  it("ne laisse plus le mot de passe du routeur dans l'environnement du conteneur", async () => {
    /* Les MIKHMON_MT_* n'étaient lues par AUCUN fichier de l'image : elles ne
       servaient à rien, et MIKHMON_MT_PASS exposait le mot de passe à qui
       sait lancer `docker inspect`. */
    const commands: string[] = [];
    await provisionCloudMikhmon({
      router: {
        id: "123e4567-e89b-12d3-a456-426614174000",
        name: "RB951 Korhogo",
        tunnelIp: "10.66.0.48",
        username: "safelinkhub-api",
        password: "s3cr3t",
        hotspotName: "KORHOGO-WIFI",
        dnsName: "korhogo.ci",
      },
      existing: null,
      usedPorts: [],
      baseDomain: "mikhmon.safelinkhub.io",
      run: async (command) => { commands.push(command); return ""; },
    });
    const creation = commands.find((c) => c.includes("docker run -d"))!;
    assert.ok(!creation.includes("MIKHMON_MT_PASS"), "mot de passe encore en variable d'env");
    assert.ok(!creation.includes("s3cr3t"), "mot de passe en clair dans la commande docker run");
  });

  it("ne recrée pas de conteneur quand l'instance existe — mais repose la session", async () => {
    /* Ce test affirmait auparavant qu'AUCUNE commande n'était lancée. Cette
       promesse-là condamnait toute instance déjà créée à rester vide : le
       bouton d'activation ne pouvait plus rien réparer. L'idempotence porte
       désormais sur ce qui compte — pas de second conteneur, ni domaine ni
       port qui bougent — et la session est réécrite depuis la base. */
    const commands: string[] = [];

    const instance = await provisionCloudMikhmon({
      router: {
        id: "123e4567-e89b-12d3-a456-426614174000",
        name: "RB951 Korhogo",
        tunnelIp: "10.66.0.23",
        username: "api",
        password: "secret",
        hotspotName: "KORHOGO-WIFI",
        dnsName: "korhogo.ci",
      },
      existing: {
        domain: "rb951-korhogo-14174000.mikhmon.safelinkhub.io",
        containerName: "slh-mikhmon-123e4567e89b12d3a456426614174000",
        localPort: 20_000,
        status: "active",
      },
      usedPorts: [20_000],
      baseDomain: "mikhmon.safelinkhub.io",
      run: async (command) => {
        commands.push(command);
        return "";
      },
    });

    assert.equal(instance.localPort, 20_000);
    assert.equal(instance.domain, "rb951-korhogo-14174000.mikhmon.safelinkhub.io");
    assert.ok(!commands.some((c) => c.includes("docker run")), "un second conteneur a été créé");
    assert.ok(commands.some((c) => c.includes("config.php")), "la session n'a pas été reposée");
  });
});

/* Panne HSPT-BELIKORO (11/09/2026) : un conteneur d'un routeur SUPPRIMÉ tenait
   encore 127.0.0.1:20001 sur le relais, sans plus aucune ligne en base. La base
   disait [20000, 20002], l'allocateur choisissait 20001, Docker refusait. */
describe("port choisi d'après Docker, pas seulement d'après la base", () => {
  const routeur = {
    id: "0e25d85e-2d1d-44e3-86b0-53740b492503",
    name: "HSPT-BELIKORO",
    tunnelIp: "10.66.0.50",
    username: "api",
    password: "secret",
    hotspotName: "BELIKORO",
    dnsName: "belikoro.ci",
  };
  const psSortie = [
    "127.0.0.1:20000->80/tcp",
    "127.0.0.1:20001->80/tcp", // l'orphelin : aucune ligne en base
    "127.0.0.1:20002->80/tcp",
    "", // le débris « Created » de la tentative ratée : rien de publié
    "0.0.0.0:443->443/tcp, [::]:443->443/tcp", // Traefik : hors plage, ignoré
  ].join("\n");

  it("saute le port tenu par un orphelin sans ligne en base", async () => {
    const commands: string[] = [];
    const instance = await provisionCloudMikhmon({
      router: routeur,
      existing: null,
      usedPorts: [20_000, 20_002],
      baseDomain: "mikhmon.safelinkhub.io",
      run: async (command) => {
        commands.push(command);
        return command.includes("docker ps") ? psSortie : "";
      },
    });
    assert.equal(instance.localPort, 20_003);
    const creation = commands.find((c) => c.includes("docker run -d"))!;
    assert.ok(creation.includes("127.0.0.1:20003:80"));
    assert.ok(!creation.includes(":20001:"), "le port de l'orphelin a été redistribué");
  });

  it("retire d'abord l'homonyme, PUIS lit les ports : un port qu'il tenait redevient libre", async () => {
    const commands: string[] = [];
    await provisionCloudMikhmon({
      router: routeur,
      existing: null,
      usedPorts: [],
      baseDomain: "mikhmon.safelinkhub.io",
      run: async (command) => {
        commands.push(command);
        return "";
      },
    });
    const rm = commands.findIndex((c) => c.includes("rm -f") && c.includes(routeur.id.replace(/-/g, "")));
    const ps = commands.findIndex((c) => c.includes("docker ps"));
    assert.ok(rm >= 0 && ps >= 0);
    assert.ok(rm < ps, "l'homonyme doit être retiré avant la lecture des ports");
  });

  it("un docker run refusé ne laisse pas de conteneur « Created » derrière lui", async () => {
    const commands: string[] = [];
    await assert.rejects(
      provisionCloudMikhmon({
        router: routeur,
        existing: null,
        usedPorts: [],
        baseDomain: "mikhmon.safelinkhub.io",
        run: async (command) => {
          commands.push(command);
          if (command.includes("docker run")) throw new Error("Bind for 127.0.0.1:20001 failed: port is already allocated");
          return "";
        },
      }),
      /port is already allocated/,
    );
    // Sinon la tentative suivante bute sur « name is already in use ».
    const apresRun = commands.slice(commands.findIndex((c) => c.includes("docker run")) + 1);
    assert.ok(apresRun.some((c) => c.includes("rm -f")), "le débris n'a pas été retiré");
  });
});
