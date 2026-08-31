import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { revenuParZone, ZONE_INCONNUE, type VenteZone } from "./par-zone";

const v = (routerId: string | null, routerName: string | null, prix: number, com = 0): VenteZone => ({
  routerId,
  routerName,
  priceCents: prix,
  commissionCents: com,
});

describe("revenu par zone", () => {
  it("groupe, additionne et classe la plus rentable en tête", () => {
    const lignes = revenuParZone([
      v("a", "RUE-NICOLAS", 500),
      v("b", "HSPT-YAHYA", 800),
      v("a", "RUE-NICOLAS", 500),
    ]);
    assert.deepEqual(
      lignes.map((l) => [l.nom, l.ventes, l.revenuCents]),
      [
        ["RUE-NICOLAS", 2, 1000],
        ["HSPT-YAHYA", 1, 800],
      ],
    );
  });

  it("le total des zones est EXACTEMENT le revenu global", () => {
    /* Une zone perdue au groupement se verrait ici, et nulle part ailleurs :
       la somme affichée en haut de page vient d'un autre calcul. */
    const ventes = [v("a", "A", 500), v("b", "B", 800), v(null, null, 300), v("a", "A", 1500)];
    const lignes = revenuParZone(ventes);
    assert.equal(
      lignes.reduce((s, l) => s + l.revenuCents, 0),
      ventes.reduce((s, x) => s + x.priceCents, 0),
    );
    assert.equal(lignes.reduce((s, l) => s + l.ventes, 0), ventes.length);
  });

  it("deux routeurs de MÊME NOM restent deux zones", () => {
    /* Le groupement se fait sur l'identifiant. Fondre sur le nom ferait
       disparaître une zone de la liste tout en gonflant l'autre — et
       « HOTSPOT » est un nom que l'on retrouve souvent. */
    const lignes = revenuParZone([v("a", "HOTSPOT", 500), v("b", "HOTSPOT", 500)]);
    assert.equal(lignes.length, 2);
  });

  it("une vente sans routeur n'est pas perdue", () => {
    // Routeur supprimé depuis : l'argent a bien été encaissé, il doit rester
    // visible plutôt que de s'évaporer du total.
    const [ligne] = revenuParZone([v(null, null, 300)]);
    assert.equal(ligne.nom, ZONE_INCONNUE);
    assert.equal(ligne.revenuCents, 300);
  });

  it("sans aucune vente, aucune part n'est calculée", () => {
    // Une division par zéro donnerait « NaN % » à l'écran.
    assert.deepEqual(revenuParZone([]), []);
    const [ligne] = revenuParZone([v("a", "A", 0)]);
    assert.equal(ligne.part, 0);
  });

  it("les parts se lisent comme un pourcentage du total", () => {
    const lignes = revenuParZone([v("a", "A", 750), v("b", "B", 250)]);
    assert.deepEqual(lignes.map((l) => l.part), [75, 25]);
  });
});
