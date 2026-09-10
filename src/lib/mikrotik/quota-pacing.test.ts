import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CRITICAL_RATIO, SAFETY, cycleDays, pace } from "./quota-pacing";

const MB = 1024 * 1024;
const GB = 1024 * MB;
/** Le forfait du parc : 4,5 To par mois et par routeur. */
const QUOTA_MB = 4.5 * 1024 * 1024;
const d = (iso: string) => new Date(iso);

describe("découpe du cycle", () => {
  it("compte les jours du cycle de FACTURATION, pas du mois calendaire", () => {
    // Facturation le 15 : le 20 septembre, on est au 6e jour du cycle
    // ouvert le 15 septembre — pas au 20e jour de septembre.
    const c = cycleDays(d("2026-09-20T12:00:00Z"), 15);
    assert.equal(c.elapsed, 6);
    assert.equal(c.total, 30); // 15 sept → 15 oct
    assert.equal(c.remaining, 25);
  });

  it("le jour de facturation est le jour 1, jamais le jour 0", () => {
    // Une fraction de journée nulle mettrait la ligne de rythme à zéro et
    // ferait basculer en blocage au premier octet du cycle.
    for (const heure of ["T00:00:00Z", "T00:00:01Z", "T23:59:59Z"]) {
      const c = cycleDays(d("2026-09-01" + heure), 1);
      assert.equal(c.elapsed, 1, `à ${heure}`);
      assert.equal(c.remaining, c.total);
    }
  });

  it("le dernier jour du cycle laisse 1 jour restant, pas 0", () => {
    // Un 0 ici ferait diviser par zéro le budget du jour.
    const c = cycleDays(d("2026-09-30T18:00:00Z"), 1);
    assert.equal(c.elapsed, 30);
    assert.equal(c.remaining, 1);
  });

  it("suit la longueur réelle du mois", () => {
    assert.equal(cycleDays(d("2026-02-10T00:00:00Z"), 1).total, 28);
    assert.equal(cycleDays(d("2026-03-10T00:00:00Z"), 1).total, 31);
    // Facturation le 28 en février : le cycle va du 28 fév au 28 mars.
    assert.equal(cycleDays(d("2026-03-01T00:00:00Z"), 28).total, 28);
  });
});

describe("verdict de rythme", () => {
  /** Consommation pile sur la ligne de rythme au jour `jour`. */
  const aLHeure = (jour: number, total = 30) => QUOTA_MB * MB * SAFETY * (jour / total);

  it("à l'heure : on ne freine pas", () => {
    const p = pace(aLHeure(10), QUOTA_MB, d("2026-09-10T12:00:00Z"), 1);
    assert.equal(p.level, "ok");
    assert.ok(Math.abs(p.ratio - 1) < 0.001);
  });

  it("en avance : on bride", () => {
    // 1,5 To au 5e jour d'un forfait 4,5 To : trois fois trop vite.
    const p = pace(1.5 * 1024 * GB, QUOTA_MB, d("2026-09-05T12:00:00Z"), 1);
    assert.equal(p.level, "block"); // au-delà de 110 %, on ne bride plus
    assert.ok(p.ratio > CRITICAL_RATIO);
  });

  it("légèrement en avance : bridage, pas blocage", () => {
    const p = pace(aLHeure(10) * 1.05, QUOTA_MB, d("2026-09-10T12:00:00Z"), 1);
    assert.equal(p.level, "throttle");
  });

  it("le plafond DUR bloque même si le rythme paraît tenu", () => {
    // Dernier jour du cycle : la ligne de rythme rejoint le budget, donc un
    // dépassement du plafond réel n'y apparaîtrait que comme une avance
    // modeste. Le plafond doit compter pour lui-même.
    const p = pace(QUOTA_MB * MB, QUOTA_MB, d("2026-09-30T12:00:00Z"), 1);
    assert.equal(p.level, "block");
    assert.ok(p.ratio < CRITICAL_RATIO, "le seul ratio n'aurait pas bloqué");
  });

  it("consommer dès le premier jour ne déclenche pas un blocage absurde", () => {
    // Le piège de la division : au tout début du cycle, une fraction écoulée
    // nulle donnerait un ratio infini.
    const p = pace(GB, QUOTA_MB, d("2026-09-01T00:00:30Z"), 1);
    assert.equal(p.level, "ok");
    assert.ok(Number.isFinite(p.ratio));
  });

  it("lien illimité : aucun freinage, aucun budget", () => {
    for (const q of [null, 0]) {
      const p = pace(50 * 1024 * GB, q, d("2026-09-15T12:00:00Z"), 1);
      assert.equal(p.level, "ok");
      assert.equal(p.dailyBudgetBytes, null);
      assert.equal(p.onPaceBytes, null);
    }
  });
});

describe("budget du jour", () => {
  it("se resserre tout seul après un dépassement", () => {
    // C'est la propriété qui remplace un compteur journalier : pas d'état en
    // plus, le rattrapage tombe du calcul.
    const jour = d("2026-09-10T12:00:00Z");
    const sage = pace(QUOTA_MB * MB * 0.2, QUOTA_MB, jour, 1);
    const gourmand = pace(QUOTA_MB * MB * 0.6, QUOTA_MB, jour, 1);
    assert.ok(gourmand.dailyBudgetBytes! < sage.dailyBudgetBytes!);
  });

  it("ne descend jamais sous zéro une fois le budget épuisé", () => {
    // Un budget négatif se traduirait en une limite de débit négative sur le
    // routeur — commande refusée, et plus aucune régulation.
    const p = pace(QUOTA_MB * MB * 2, QUOTA_MB, d("2026-09-10T12:00:00Z"), 1);
    assert.equal(p.dailyBudgetBytes, 0);
  });

  it("étalé sur tout le cycle, le budget épuise le forfait sans le dépasser", () => {
    // Somme des budgets journaliers en consommant exactement ce qui est permis
    // chaque jour : on doit finir au budget de sécurité, pas au-dessus.
    let consomme = 0;
    for (let jour = 1; jour <= 30; jour++) {
      const p = pace(consomme, QUOTA_MB, d(`2026-09-${String(jour).padStart(2, "0")}T12:00:00Z`), 1);
      assert.equal(p.level, "ok", `jour ${jour} : un client discipliné ne doit jamais être bridé`);
      consomme += p.dailyBudgetBytes!;
    }
    const plafond = QUOTA_MB * MB;
    assert.ok(consomme <= plafond, "le forfait est dépassé");
    assert.ok(consomme > plafond * 0.9, "on laisse trop de quota inutilisé");
  });
});

describe("projection", () => {
  it("extrapole la fin de cycle au rythme courant", () => {
    // 1 To en 10 jours sur un cycle de 30 → 3 To projetés.
    const p = pace(1024 * GB, QUOTA_MB, d("2026-09-10T12:00:00Z"), 1);
    assert.ok(Math.abs(p.projectedBytes! - 3 * 1024 * GB) < GB);
  });
});
