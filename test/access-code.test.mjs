import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");

const GENERATOR = "src/lib/access-code.ts";
// Les quatre modules qui fabriquaient chacun leur propre générateur.
const CONSUMERS = [
  "src/lib/portal/fulfill.ts",
  "src/lib/vouchers/actions.ts",
  "src/lib/roaming/actions.ts",
  "src/lib/agents/actions.ts",
];

test("les codes d'accès sont tirés d'une source cryptographique", async () => {
  const source = await read(GENERATOR);

  assert.match(source, /import \{ randomInt \} from "node:crypto"/);
  assert.match(source, /randomInt\(0, ACCESS_CODE_CHARS\.length\)/);
  // Le défaut corrigé : V8 xorshift128+ est prédictible à partir de ses sorties.
  assert.doesNotMatch(source.replace(/\/\*[\s\S]*?\*\//g, ""), /Math\.random\(/);
});

test("l'alphabet et la longueur des codes ne changent pas", async () => {
  const source = await read(GENERATOR);

  // Contraintes des identifiants hotspot RouterOS, et surtout : les codes DÉJÀ
  // VENDUS doivent rester valides. Seule la source d'aléa devait changer.
  assert.match(source, /ACCESS_CODE_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789"/);
  assert.match(source, /ACCESS_CODE_DEFAULT_LENGTH = 6/);
});

test("aucun module ne refabrique son propre générateur de codes", async () => {
  for (const path of CONSUMERS) {
    const source = await read(path);
    assert.match(
      source,
      /import \{ randomAccessCode as randomCode \} from "@\/lib\/access-code"/,
      `${path} doit utiliser le générateur partagé`,
    );
    // C'est la DUPLICATION qui avait laissé passer le défaut : quatre copies,
    // une seule aurait suffi à ce qu'on la relise.
    assert.doesNotMatch(source, /function randomCode\s*\(/, `${path} ne doit plus définir randomCode`);
    assert.doesNotMatch(source, /Math\.random\(/, `${path} ne doit plus tirer avec Math.random`);
  }
});

test("le code d'accès sert d'identifiant ET de mot de passe hotspot", async () => {
  const source = await read("src/lib/portal/fulfill.ts");

  // C'est ce qui fait du code un SECRET et non un identifiant : si ce couple
  // change un jour, la justification du générateur crypto doit être relue.
  assert.match(source, /"\/ip\/hotspot\/user\/add"/);
  assert.match(source, /`=name=\$\{code\}`/);
  assert.match(source, /`=password=\$\{code\}`/);
});
