import assert from "node:assert/strict";
import test from "node:test";
import { orgDisplayName, quotaShortLabel, roleBadge } from "./user-labels";

test("l'organisation qui répète la personne ne s'affiche pas", () => {
  // Cas réel du registre : l'inscription crée « Organisation de <nom> », que la
  // colonne répétait en face du nom, tronqué par-dessus le marché.
  assert.equal(orgDisplayName("Organisation de Latif Bamba", "Latif Bamba"), "");
  assert.equal(orgDisplayName("Organisation de ZIE ADAMA KONE", "zie adama kone"), "");
  // Accents et casse ne doivent pas faire échouer la comparaison.
  assert.equal(orgDisplayName("Organisation de Touré Cheickna", "Toure Cheickna"), "");
});

test("une vraie organisation, elle, s'affiche — sans le préfixe", () => {
  assert.equal(orgDisplayName("Organisation de Réseaux du Marché", "Awa Traoré"), "Réseaux du Marché");
  assert.equal(orgDisplayName("Atelier Réseau Abidjan", "Awa Traoré"), "Atelier Réseau Abidjan");
});

test("l'état de l'accès tient en un mot, et l'absence ne s'écrit pas", () => {
  assert.equal(quotaShortLabel("free"), "Gratuit");
  assert.equal(quotaShortLabel("paid"), "VPN payant");
  assert.equal(quotaShortLabel("unlimited"), "Illimité");
  // « Par défaut » = rien d'accordé : l'écrire remplissait la moitié des lignes.
  assert.equal(quotaShortLabel("default"), "");
});

test("le rôle ne s'affiche que s'il sort de l'ordinaire", () => {
  assert.equal(roleBadge("superadmin"), "Superadmin");
  assert.equal(roleBadge("admin"), "");
});
