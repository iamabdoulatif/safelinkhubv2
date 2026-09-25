import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

/* Le code ne pilote QUE MikroTik (API RouterOS) et n'embarque aucun serveur
 * RADIUS. La landing affirmait « indépendant du constructeur », « prend en
 * charge MikroTik, Ruijie, TP-Link, Ubiquiti… » et un « noyau RADIUS cloud ».
 * Ces tests empêchent la rechute tant que ces intégrations n'existent pas. */

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");

test("aucune promesse de matériel ou de RADIUS que le code ne tient pas", async () => {
  for (const f of ["src/lib/i18n/fr.ts", "src/lib/i18n/en.ts", "src/components/landing/content.ts"]) {
    const src = (await read(f)).replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(src, /RADIUS (cloud|core|puissant)|serveur RADIUS|cloud RADIUS/i, `${f} : RADIUS inexistant`);
    assert.doesNotMatch(src, /indépendant du (matériel|constructeur)|(vendor|hardware)-independent/i, `${f} : indépendance matérielle non tenue`);
    assert.doesNotMatch(src, /prend en charge MikroTik, Ruijie|supports MikroTik, Ruijie/, `${f} : liste de marques « prises en charge »`);
    assert.doesNotMatch(src, /constructeurs pris en charge|vendors supported/, `${f} : compteur de constructeurs`);
  }
});
