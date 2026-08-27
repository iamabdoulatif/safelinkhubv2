import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import {
  cloudMikhmonDomain,
  cloudMikhmonPort,
  routerCloudSlug,
  normalizeCustomSlug,
  RESERVED_CLOUD_LABELS,
} from "./mikhmon-cloud-domain";

describe("MikHmon cloud domains", () => {
  it("fabrique un sous-domaine stable, sûr et non devinable", () => {
    assert.equal(
      routerCloudSlug("RB951 Korhogo", "123e4567-e89b-12d3-a456-426614174000"),
      "rb951-korhogo-14174000",
    );
    assert.equal(
      cloudMikhmonDomain("rb951-korhogo-42661417", "mikhmon.safelinkhub.io"),
      "rb951-korhogo-42661417.mikhmon.safelinkhub.io",
    );
  });

  it("refuse une base de domaine ou un slug dangereux", () => {
    assert.throws(() => cloudMikhmonDomain("../../etc", "mikhmon.safelinkhub.io"));
    assert.throws(() => cloudMikhmonDomain("rb951", "https://mikhmon.safelinkhub.io/path"));
  });

  it("attribue uniquement des ports loopback dans le pool cloud", () => {
    assert.equal(cloudMikhmonPort([]), 20_000);
    assert.equal(cloudMikhmonPort([20_000, 20_001, 20_003]), 20_002);
  });
});

describe("sous-domaine choisi par l'exploitant", () => {
  const ok = (raw: string) => {
    const v = normalizeCustomSlug(raw);
    assert.ok(v.ok, `refusé alors qu'il devait passer : ${raw} → ${v.ok ? "" : v.erreur}`);
    return v.slug;
  };
  const refuse = (raw: string, motif: RegExp) => {
    const v = normalizeCustomSlug(raw);
    assert.ok(!v.ok, `accepté alors qu'il devait être refusé : ${JSON.stringify(raw)}`);
    assert.match(v.erreur, motif);
  };

  it("accepte une étiquette lisible et la normalise", () => {
    assert.equal(ok("  Hotspot-Korhogo  "), "hotspot-korhogo");
    assert.equal(ok("WIFI2024"), "wifi2024");
    // Les accents sont retirés, pas refusés : « Béoumi » reste utilisable.
    assert.equal(ok("Béoumi"), "beoumi");
  });

  it("refuse ce qui ne tient pas dans une étiquette DNS", () => {
    refuse("-debut", /tirets? uniquement|début/i);
    refuse("fin-", /tirets? uniquement|début/i);
    refuse("avec espace", /Lettres, chiffres/);
    refuse("point.dedans", /Lettres, chiffres/);
    refuse("ab", /Trop court/);
    refuse("x".repeat(41), /Trop long/);
    refuse("", /Choisissez/);
  });

  it("refuse le double tiret — c'est la porte des adresses trompeuses", () => {
    /* « xn-- » est le préfixe des noms internationalisés : un navigateur peut
       réafficher l'adresse en caractères non latins. */
    refuse("xn--80ak6aa92e", /Deux tirets/);
    refuse("a--b", /Deux tirets/);
  });

  it("refuse les étiquettes d'autorité", () => {
    // Un client qui prend « admin » se donne une adresse qui n'est pas la sienne.
    for (const mot of ["admin", "ADMIN", " support ", "www", "safelinkhub"]) {
      refuse(mot, /réservé/);
    }
  });

  it("les noms de shards sont refusés par la LONGUEUR, pas par la réserve", () => {
    /* Mesuré, pas supposé : « s1 »…« s4 » font deux caractères et tombent sur
       le minimum de 3 avant que la liste réservée soit consultée. Ils y
       figurent quand même — si le minimum baissait un jour, la protection
       serait déjà là. Ma première version affirmait « réservé » : c'était faux. */
    for (const shard of ["s1", "s2", "s3", "s4"]) {
      refuse(shard, /Trop court/);
      assert.ok(RESERVED_CLOUD_LABELS.has(shard), `${shard} devrait rester dans la réserve`);
    }
  });

  it("ne prétend PAS garantir l'unicité", () => {
    /* Deux routeurs peuvent demander la même étiquette : la validation les
       laisse passer tous les deux, et c'est la base qui tranche. Ce test fige
       cette limite pour que personne ne prenne la fonction pour une réservation. */
    assert.equal(ok("hotspot"), "hotspot");
    assert.equal(ok("hotspot"), "hotspot");
  });
});

describe("le sous-domaine choisi traverse bien jusqu'à la provision", () => {
  it("l'écran envoie le slug, et l'action le valide avant tout travail", async () => {
    const dialogue = await readFile(
      new URL("../../app/admin/mikhmon-online/MikhmonCloudActivationDialog.tsx", import.meta.url),
      "utf8",
    );
    const action = await readFile(new URL("./port-forward.ts", import.meta.url), "utf8");
    // Le slug est le 5e argument : sans lui, l'écran offrirait un champ décoratif.
    assert.match(dialogue, /enablePortForward\(\s*router\.id,\s*"mikhmon",\s*"monthly",\s*edition,\s*slug\s*\)/);
    // Et le refus arrive AVANT la moindre écriture.
    assert.match(action, /normalizeCustomSlug\(slugRaw\)/);
    assert.match(action, /if \(!verdict\.ok\) return \{ error: verdict\.erreur \}/);
  });

  it("le bouton d'activation est bloqué tant que l'adresse est invalide", () => {
    // Sinon l'exploitant part en provision avec une adresse que Traefik refusera.
    return readFile(
      new URL("../../app/admin/mikhmon-online/MikhmonCloudActivationDialog.tsx", import.meta.url),
      "utf8",
    ).then((d) => assert.match(d, /disabled=\{!tunnel\.ready \|\| pending \|\| !verdictSlug\.ok\}/));
  });

  it("une réactivation ne peut PAS changer le domaine", async () => {
    /* Le domaine figure dans une règle Traefik et dans les favoris de
       l'exploitant : le rouvrir à chaque réactivation casserait ses liens. */
    const cloud = await readFile(new URL("./mikhmon-cloud.ts", import.meta.url), "utf8");
    assert.match(cloud, /slug: existing \? undefined : slugChoisi/);
  });
});
