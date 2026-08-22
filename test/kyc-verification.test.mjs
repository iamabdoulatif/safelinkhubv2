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
    "src/app/admin/verification/ReviewQueue.tsx",
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
