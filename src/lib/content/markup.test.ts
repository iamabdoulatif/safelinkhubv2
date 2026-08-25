import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import {
  countOccurrences,
  outline,
  parseContent,
  parseInline,
  plainText,
  readingMinutes,
  videoEmbedUrl,
  videoProvider,
  wordCount,
  youtubeId,
} from "./markup";
import { analyseSeo } from "./seo";

describe("compatibilité avec l'existant", () => {
  it("un article écrit AVANT la nouvelle syntaxe se rend à l'identique", () => {
    /* Le contenu déjà en base est du texte brut avec « ## » : si l'analyse
       changeait son rendu, il faudrait convertir la base — ce qu'on refuse. */
    const ancien = "Premier paragraphe.\n\n## Un intertitre\n\nSecond paragraphe.";
    assert.deepEqual(
      parseContent(ancien).map((b) => b.kind),
      ["paragraph", "h2", "paragraph"],
    );
  });

  it("un texte sans aucun marqueur reste un seul paragraphe", () => {
    const b = parseContent("Juste une phrase.");
    assert.equal(b.length, 1);
    assert.equal(b[0].kind, "paragraph");
  });
});

describe("blocs", () => {
  it("reconnaît chaque type", () => {
    const src = [
      "## Deux",
      "### Trois",
      "!video https://youtu.be/abcdef",
      "> Une citation",
      "- a\n- b",
      "Un paragraphe",
    ].join("\n\n");
    assert.deepEqual(
      parseContent(src).map((b) => b.kind),
      ["h2", "h3", "video", "quote", "list", "paragraph"],
    );
  });

  it("un H3 n'est jamais pris pour un H2", () => {
    /* Ce qui les sépare est l'ESPACE dans le marqueur : « ### Trois » ne
       commence pas par « ## » (la troisième position est un dièse, pas une
       espace). Sans cette espace, l'ordre des tests deviendrait décisif et un
       H3 sortirait en H2 portant un dièse en trop. Vérifié plutôt que supposé —
       ma première version affirmait l'inverse. */
    assert.equal("### Trois".startsWith("## "), false, "c'est l'espace qui tranche");
    const [b] = parseContent("### Trois");
    assert.equal(b.kind, "h3");
    assert.equal(b.kind === "h3" && b.inline.map((i) => i.text).join(""), "Trois");
  });

  it("une citation sur plusieurs lignes reste UN bloc", () => {
    const [b] = parseContent("> ligne un\n> ligne deux");
    assert.equal(b.kind, "quote");
    assert.equal(b.kind === "quote" && b.inline[0].text, "ligne un ligne deux");
  });
});

describe("mise en forme dans le texte", () => {
  it("gras, italique et lien, dans l'ordre d'apparition", () => {
    assert.deepEqual(
      parseInline("a **b** c *d* e [f](https://g.h) i").map((p) => p.kind),
      ["text", "bold", "text", "italic", "text", "link", "text"],
    );
  });

  it("ne fabrique pas de lien depuis une adresse non http", () => {
    // Un `javascript:` dans un href serait une injection : le motif n'accepte
    // que http(s).
    const parts = parseInline("[x](javascript:alert(1))");
    assert.ok(!parts.some((p) => p.kind === "link"));
  });

  it("un astérisque isolé n'ouvre pas d'italique", () => {
    assert.deepEqual(parseInline("3 * 4 = 12").map((p) => p.kind), ["text"]);
  });
});

describe("vidéo", () => {
  it("reconnaît les formes courantes de lien YouTube", () => {
    for (const u of [
      "https://youtu.be/dQw4w9WgXcQ",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
      "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    ]) {
      assert.equal(youtubeId(u), "dQw4w9WgXcQ", u);
    }
  });

  it("intègre YouTube SANS cookie et Vimeo sans suivi", () => {
    /* Le site public n'a pas de bandeau de consentement : un lecteur qui lit un
       article ne doit pas repartir avec un traceur. */
    assert.match(videoEmbedUrl("https://youtu.be/dQw4w9WgXcQ")!, /youtube-nocookie\.com/);
    assert.match(videoEmbedUrl("https://vimeo.com/123456789")!, /dnt=1/);
  });

  it("distingue un fichier d'une plateforme, et refuse l'inconnu", () => {
    assert.equal(videoProvider("https://exemple.com/a.mp4"), "file");
    assert.equal(videoProvider("https://exemple.com/page"), "unknown");
    assert.equal(videoEmbedUrl("https://exemple.com/page"), null);
  });
});

describe("mesures", () => {
  it("le comptage ignore les marqueurs et l'URL des vidéos", () => {
    /* Compter « ## » ou une URL comme des mots gonflerait le total et
       fausserait la densité du mot-clé. */
    assert.equal(wordCount("## Titre\n\nun deux trois"), 4);
    assert.equal(wordCount("!video https://youtu.be/abcdef\n\nun deux"), 2);
    assert.ok(!plainText("!video https://youtu.be/abcdef").includes("youtu.be"));
  });

  it("le temps de lecture ne descend jamais sous une minute", () => {
    assert.equal(readingMinutes("deux mots"), 1);
    assert.equal(readingMinutes("mot ".repeat(400)), 2);
  });

  it("le plan ne retient que les intertitres, dans l'ordre", () => {
    assert.deepEqual(outline("## A\n\ntexte\n\n### B\n\n## C"), [
      { level: 2, text: "A" },
      { level: 3, text: "B" },
      { level: 2, text: "C" },
    ]);
  });

  it("les occurrences ignorent casse ET accents", () => {
    // « réseau » et « Reseau » désignent le même mot-clé pour un rédacteur.
    assert.equal(countOccurrences("Réseau, reseau et RESEAU", "réseau"), 3);
    assert.equal(countOccurrences("abc", ""), 0);
  });
});

describe("analyse de référencement", () => {
  const base = {
    title: "Gérer ses tâches avec un outil gratuit",
    slug: "gerer-ses-taches-outil-gratuit",
    excerpt: "Un tour des outils gratuits pour gérer ses tâches au quotidien sans exploser son budget.",
    content: "## Gérer ses tâches\n\n" + "mot ".repeat(320),
    keyword: "gérer ses tâches",
    coverImageUrl: "https://exemple.com/c.jpg",
  };

  it("un article complet obtient un score élevé", () => {
    assert.ok(analyseSeo(base).score >= 80);
  });

  it("sans mot-clé, il ne reste que les contrôles de forme", () => {
    const r = analyseSeo({ ...base, keyword: "" });
    assert.ok(r.checks.some((c) => c.id === "keyword"));
    assert.ok(!r.checks.some((c) => c.id === "density"));
  });

  it("signale un mot-clé absent du titre", () => {
    const r = analyseSeo({ ...base, title: "Un titre sans rapport du tout avec le sujet" });
    assert.equal(r.checks.find((c) => c.id === "keyword-title")?.state, "err");
  });

  it("signale la sur-répétition autant que l'absence", () => {
    const trop = analyseSeo({ ...base, content: "gérer ses tâches ".repeat(80) });
    assert.equal(trop.checks.find((c) => c.id === "density")?.state, "warn");
    const rien = analyseSeo({ ...base, content: "mot ".repeat(320) });
    assert.equal(rien.checks.find((c) => c.id === "density")?.state, "err");
  });

  it("signale un H3 posé avant tout H2", () => {
    /* Un sous-niveau sans niveau parent : un lecteur d'écran annonce une
       hiérarchie qui n'existe pas. */
    const r = analyseSeo({ ...base, content: "### Avant\n\n" + "mot ".repeat(320) + "\n\n## Après" });
    assert.equal(r.checks.find((c) => c.id === "hierarchy")?.state, "warn");
  });

  it("chaque contrôle en défaut porte une consigne", () => {
    // Un voyant rouge sans quoi-faire n'apprend rien à qui rédige.
    const r = analyseSeo({ title: "", slug: "", excerpt: "", content: "", keyword: "x" });
    for (const c of r.checks) {
      if (c.state !== "ok") assert.ok(c.hint.length > 10, `${c.id} sans consigne`);
    }
  });
});

describe("l'éditeur écrit la syntaxe que le rendu sait lire", () => {
  it("les deux lisent le même module", async () => {
    const editeur = await readFile(
      new URL("../../components/content/RichTextEditor.tsx", import.meta.url),
      "utf8",
    );
    const rendu = await readFile(
      new URL("../../components/content/ContentBlocks.tsx", import.meta.url),
      "utf8",
    );
    assert.match(editeur, /from "@\/lib\/content\/markup"/);
    assert.match(rendu, /from "@\/lib\/content\/markup"/);
    // Le champ reste un textarea nommé : le formulaire s'envoie comme avant.
    assert.match(editeur, /<textarea[\s\S]{0,400}name=\{name\}/);
  });

  it("les marqueurs de la barre d'outils sont ceux du parseur", async () => {
    const editeur = await readFile(
      new URL("../../components/content/RichTextEditor.tsx", import.meta.url),
      "utf8",
    );
    for (const marqueur of ['avant: "\\*\\*"', 'prefixe: "## "', 'prefixe: "### "', '"!video {url}"']) {
      assert.ok(editeur.includes(marqueur.replace(/\\/g, "")), `marqueur absent : ${marqueur}`);
    }
  });
});
