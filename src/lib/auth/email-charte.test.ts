import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";

const lire = (rel: string) => readFile(new URL(rel, import.meta.url), "utf8");

/** Les hex utilisés dans le gabarit, hors commentaires. */
async function couleursDuMail(): Promise<string[]> {
  const src = await lire("./email.ts");
  const sansCommentaires = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  return [...sansCommentaires.matchAll(/#[0-9A-Fa-f]{6}/g)].map((m) => m[0].toUpperCase());
}

describe("les e-mails suivent la peau Slate", () => {
  it("plus aucune couleur de l'ancienne direction moutarde", async () => {
    /* #E0A82E était le CTA des e-mails, hérité de la direction Bitume
       abandonnée quand toute l'application est passée en Slate. Les
       destinataires recevaient donc un bouton d'une identité qui n'existe
       plus nulle part ailleurs. */
    const couleurs = await couleursDuMail();
    for (const moutarde of ["#E0A82E", "#EAB308", "#A16207"]) {
      assert.ok(!couleurs.includes(moutarde), `couleur abandonnée encore présente : ${moutarde}`);
    }
  });

  it("le lime du bouton est EXACTEMENT celui de globals.css", async () => {
    /* Un client de messagerie ne lit pas les variables CSS : la valeur est
       forcément recopiée. Ce test est le seul lien entre les deux copies. */
    const css = await lire("../../app/globals.css");
    const brand = css.match(/--brand:\s*(#[0-9A-Fa-f]{6})/g)?.pop()?.match(/#[0-9A-Fa-f]{6}/)?.[0];
    assert.ok(brand, "--brand introuvable dans globals.css");
    assert.ok(
      (await couleursDuMail()).includes(brand.toUpperCase()),
      `le mail devrait utiliser ${brand}`,
    );
  });

  it("le texte du bouton est sombre, jamais blanc", async () => {
    /* Règle de la charte : « --brand est l'aplat, texte noir dessus, jamais
       blanc » — #D6F344 ne tient pas 1,3:1 face au blanc. */
    const src = await lire("./email.ts");
    const bouton = src.match(/background:#D6F344;color:(#[0-9A-Fa-f]{6})/);
    assert.ok(bouton, "bouton lime introuvable");
    assert.notEqual(bouton[1].toUpperCase(), "#FFFFFF");
  });

  it("chaque couleur du mail appartient bien à la charte", async () => {
    // Un hex inventé au fil des ajouts est exactement ce qui a fait dériver
    // les e-mails la première fois.
    const autorisees = new Set([
      "#D6F344", // --brand
      "#3F6212", // --brand-deep
      "#12301D", // --slate-deep
      "#10160F", // --ink sous .theme-slate
      "#E2E7DC", // --line
      "#FFFFFF", // --paper
      "#5A6B5E", // texte secondaire de la peau Slate
    ]);
    for (const c of await couleursDuMail()) {
      assert.ok(autorisees.has(c), `couleur hors charte dans les e-mails : ${c}`);
    }
  });
});
