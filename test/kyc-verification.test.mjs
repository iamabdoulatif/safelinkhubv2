import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");

test("aucune pièce d'identité ne part vers un stockage public", async () => {
  /* Le seul téléversement du produit, uploadPaymentProof, écrit en
     `access: "public"` : une URL devinée ou fuitée exposerait les papiers
     d'une personne. Acceptable pour une capture de paiement, pas pour un
     passeport — les pièces passent donc par le canal privé. */
  const preuve = await read("src/lib/billing/manual-payment.ts");
  assert.match(preuve, /access: "public"/, "hypothèse du test : le stockage est bien public");

  for (const f of [
    "src/lib/kyc/actions.ts",
    "src/app/admin/verification/page.tsx",
    "src/app/admin/verification/VerificationCenter.tsx",
    "src/app/admin/kyc/page.tsx",
    "src/app/admin/kyc/[orgId]/page.tsx",
    "src/lib/kyc/queries.ts",
    "src/app/admin/kyc/RowActions.tsx",
  ]) {
    const src = await read(f);
    assert.doesNotMatch(src, /uploadPaymentProof|@vercel\/blob|\bput\(/, `${f} ne doit rien téléverser`);
    assert.doesNotMatch(src, /type="file"/, `${f} ne doit pas proposer d'envoi de fichier`);
  }

  // Et le schéma ne garde aucune URL de document.
  const schema = await read("src/lib/db/schema.ts");
  const bloc = schema.slice(
    schema.indexOf("export const kycVerifications = pgTable("),
    schema.indexOf("export const contactMessages"),
  );
  assert.ok(bloc.length > 200, "table KYC introuvable");
  assert.doesNotMatch(bloc, /document_url|proof_url|selfie/, "aucune URL de pièce en base");
});

test("une tentative se compte à la soumission, pas au refus", async () => {
  /* Sinon un dossier abandonné en cours de route n'en consommerait aucune,
     et la limite de trois ne limiterait rien. */
  const actions = await read("src/lib/kyc/actions.ts");
  const signature = actions.slice(actions.indexOf("export async function signAgreement"));
  assert.match(signature, /attempts: row\.attempts \+ 1/);
  const decision = actions.slice(actions.indexOf("export async function decideVerification"));
  assert.doesNotMatch(decision, /attempts/, "la décision ne doit pas toucher au compteur");
});

test("la décision est réservée au superadmin, la soumission à l'organisation", async () => {
  const actions = await read("src/lib/kyc/actions.ts");
  const decision = actions.slice(actions.indexOf("export async function decideVerification"));
  assert.match(decision, /isSuperAdmin\(session\.role\)/);

  // Un opérateur n'agit que sur SA propre organisation : l'orgId vient de la
  // session, jamais du formulaire.
  const signature = actions.slice(
    actions.indexOf("export async function signAgreement"),
    actions.indexOf("export async function decideVerification"),
  );
  assert.match(signature, /session\.orgId/);
  assert.doesNotMatch(signature, /formData\.get\("orgId"\)/);
});

test("un dossier déjà validé ne se rouvre pas tout seul", async () => {
  const actions = await read("src/lib/kyc/actions.ts");
  assert.match(actions, /status === "approved"/);
});

test("le module d'actions n'exporte QUE des fonctions asynchrones", async () => {
  /* Un fichier « use server » ne peut exporter que cela. Une constante n'y
     déclenche aucune erreur de typage — le bundler la retire, et TOUS les
     imports du module échouent, actions comprises. C'est ce qui a cassé le
     build la première fois. */
  const src = await read("src/lib/kyc/actions.ts");
  assert.match(src, /^"use server";/);
  const exports = [...src.matchAll(/^export (?!async function)(\w+)/gm)].map((m) => m[1]);
  assert.deepEqual(exports, [], `exports non asynchrones : ${exports.join(", ")}`);
  // La constante partagée vit dans son propre module, sans « use server ».
  const constantes = await read("src/lib/kyc/constants.ts");
  // La DIRECTIVE, pas le mot : le commentaire du fichier l'explique et
  // contenait bien la chaîne — première version de ce test, rouge à tort.
  assert.doesNotMatch(constantes, /^\s*"use server"/, "ce module ne doit pas être un module serveur");
  assert.match(constantes, /export const MAX_KYC_ATTEMPTS/);
});

test("l'écran d'examen dit où sont les pièces, et n'en montre aucune", async () => {
  /* Un examinateur qui ne verrait aucune pièce sans explication croirait à un
     bug et chercherait un bouton qui n'existe pas. La fiche le dit. */
  const fiche = await read("src/app/admin/kyc/[orgId]/page.tsx");
  assert.match(fiche, /ne sont pas stockées par SafeLinkHub/);
  assert.match(fiche, /canal privé/);
});

test("toute la section KYC d'administration est réservée au superadmin", async () => {
  for (const f of ["src/app/admin/kyc/page.tsx", "src/app/admin/kyc/[orgId]/page.tsx"]) {
    const src = await read(f);
    assert.match(src, /isSuperAdmin\(session\.role\)/, `${f} doit garder l'accès`);
  }
});

test("un statut porte le même nom sur la liste et sur la fiche", async () => {
  // Deux tables de libellés auraient fini par nommer le même état
  // différemment d'un écran à l'autre.
  const { KYC_STATUS_LABELS } = await import("../src/lib/kyc/statuses.ts");
  for (const f of ["src/app/admin/kyc/page.tsx", "src/app/admin/kyc/[orgId]/page.tsx"]) {
    assert.match(await read(f), /KYC_STATUS_LABELS/, `${f} doit lire la table partagée`);
  }
  // Et chaque statut du modèle y figure.
  const actions = await read("src/lib/kyc/actions.ts");
  for (const statut of ["under_review", "approved", "rejected"]) {
    assert.ok(KYC_STATUS_LABELS[statut], `libellé manquant : ${statut}`);
    assert.match(actions, new RegExp(statut));
  }
});

test("la fiche découpe ses volets sans état client", async () => {
  /* Les onglets vivent dans l'URL : la page reste rendue côté serveur et un
     lien rouvre le même volet. Un « use client » ici ferait basculer toute la
     fiche — et ses données — dans le navigateur. */
  const fiche = await read("src/app/admin/kyc/[orgId]/page.tsx");
  assert.doesNotMatch(fiche, /^"use client"/m);
  for (const vue of ["profil", "verification", "comptes", "journal"]) {
    assert.match(fiche, new RegExp(`onglet === "${vue}"`), `volet manquant : ${vue}`);
  }
});

test("le menu d'une ligne ne propose de décider que si le dossier est soumis", async () => {
  /* decideVerification n'écrase pas un dossier déjà décidé côté serveur, mais
     proposer « Valider » sur une organisation qui n'a rien envoyé donnerait un
     bouton sans effet — l'examinateur croirait à une panne. */
  const liste = await read("src/app/admin/kyc/page.tsx");
  assert.match(liste, /decidable=\{l\.status === "under_review"\}/);
  const menu = await read("src/app/admin/kyc/RowActions.tsx");
  assert.match(menu, /decidable \?/);
  // La décision est définitive : chaque bouton demande confirmation.
  assert.match(menu, /confirm\(/);
});

test("chaque file du parcours a son onglet ET son entrée de menu", async () => {
  /* « Pièces envoyées » n'avait pas de file : ces dossiers n'apparaissaient
     que dans « Tous », donc nulle part en pratique. */
  const { KYC_TABS } = await import("../src/lib/kyc/statuses.ts");
  const cles = KYC_TABS.map((t) => t.key);
  for (const statut of ["under_review", "documents_sent", "approved", "rejected", "not_started"]) {
    assert.ok(cles.includes(statut), `file manquante : ${statut}`);
  }
  // La barre latérale lit la MÊME liste — sinon menu et onglets divergeraient.
  const barre = await read("src/components/AdminSidebar.tsx");
  assert.match(barre, /KYC_TABS/);
  assert.match(barre, /@\/lib\/kyc\/statuses/);
});
