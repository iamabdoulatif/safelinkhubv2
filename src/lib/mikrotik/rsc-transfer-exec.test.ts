import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { executerPlan, type TalkClient } from "./rsc-transfer-exec";
import type { CommandeRsc } from "./rsc-selective-restore";

function cmd(section: string, args: string): CommandeRsc {
  return { section, verbe: "add", arguments: args };
}

describe("executerPlan", () => {
  it("saute /ip pool (déjà en place) sans appeler le routeur, mais le compte posé", async () => {
    const appels: string[][] = [];
    const client: TalkClient = {
      talk: async (mots) => {
        appels.push(mots);
      },
    };
    const bilan = await executerPlan(client, [cmd("/ip pool", "name=x ranges=1.1.1.1")]);
    assert.equal(bilan.posees, 1);
    assert.equal(bilan.echecs.length, 0);
    assert.equal(appels.length, 0, "le pool n'est pas rejoué sur le routeur");
  });

  it("pose les commandes et NOMME les refus sans s'arrêter", async () => {
    const appels: string[][] = [];
    const client: TalkClient = {
      talk: async (mots) => {
        appels.push(mots);
        if (mots.join(" ").includes("BOOM")) throw new Error("already exists");
      },
    };
    const commandes = [
      cmd("/ip hotspot user profile", "name=1h"),
      cmd("/ip hotspot user", "name=BOOM comment=up-"),
      cmd("/ip hotspot user", "name=ok comment=up-"),
    ];
    const bilan = await executerPlan(client, commandes);
    assert.equal(bilan.posees, 2, "les deux commandes acceptées sont posées");
    assert.equal(bilan.echecs.length, 1, "le refus est capturé, pas propagé");
    assert.match(bilan.echecs[0].commande, /hotspot user name=BOOM/);
    assert.match(bilan.echecs[0].raison, /already exists/);
    assert.equal(appels.length, 3, "la boucle continue après le refus");
  });

  it("construit le chemin /add à partir de la section", async () => {
    let recu: string[] = [];
    const client: TalkClient = {
      talk: async (mots) => {
        recu = mots;
      },
    };
    await executerPlan(client, [cmd("/ip hotspot user", "name=abc comment=up-")]);
    assert.equal(recu[0], "/ip/hotspot/user/add");
    assert.ok(recu.length > 1, "les arguments sont joints à la commande");
  });

  it("rapporte l'avancement par paquets et à la fin", async () => {
    const client: TalkClient = { talk: async () => {} };
    const commandes = Array.from({ length: 30 }, (_, i) => cmd("/ip hotspot user", `name=t${i}`));
    const vus: number[] = [];
    const bilan = await executerPlan(client, commandes, (p) => void vus.push(p), 10);
    assert.equal(bilan.posees, 30);
    assert.ok(vus.length >= 2, "au moins un point intermédiaire et la fin");
    assert.equal(vus[vus.length - 1], 30, "le dernier avancement = total posé");
  });
});
