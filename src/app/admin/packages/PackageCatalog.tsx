"use client";

import { useState } from "react";
import { Search, TriangleAlert } from "lucide-react";
import PriceEditor from "./PriceEditor";
import StatusToggle from "./StatusToggle";
import LadderFixButton from "./LadderFixButton";
import { formatFcfa, libelleDuree, type ZoneCatalogue } from "./package-ladder";

const TOUTES = "__toutes__";

/**
 * Le catalogue devient un INDEX + une zone lue à la fois.
 *
 * Empilées, trente-six zones font une page qu'on parcourt à l'aveugle : on ne
 * sait ni combien il y en a, ni laquelle demande une décision, et on scrolle
 * pour retrouver celle d'hier. La colonne de gauche liste TOUTES les zones —
 * nom, nombre de paliers, prix d'entrée, et un point ambre quand la grille de
 * cette zone se contredit. On voit donc le parc entier d'un coup d'œil, et le
 * détail reste lisible parce qu'il n'y en a qu'un.
 *
 * L'écran s'ouvre sur la première zone à problème : ce qui appelle une décision
 * passe devant ce qui n'en appelle aucune.
 */
function alertes(zone: ZoneCatalogue) {
  return zone.forfaits.filter((f) => f.inversion).length;
}

function prixEntree(zone: ZoneCatalogue) {
  const actifs = zone.forfaits.filter((f) => f.active);
  const source = actifs.length > 0 ? actifs : zone.forfaits;
  return source.reduce((min, f) => Math.min(min, f.priceCents), Number.POSITIVE_INFINITY);
}

function sansAccent(v: string) {
  return v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
function reglesCommunes(zone: ZoneCatalogue) {
  const parts: string[] = [];
  if (zone.debitCommun) parts.push(`Débit ${zone.debitCommun}`);
  if (zone.commissionCommune === 0) parts.push("sans commission agent");
  else if (zone.commissionCommune !== null)
    parts.push(`commission agent ${formatFcfa(zone.commissionCommune)}`);
  return parts.join(" · ");
}

export default function PackageCatalog({ zones }: { zones: ZoneCatalogue[] }) {
  const [choix, setChoix] = useState<string>(
    () => zones.find((z) => alertes(z) > 0)?.cle ?? zones[0]?.cle ?? TOUTES,
  );
  const [recherche, setRecherche] = useState("");

  const q = sansAccent(recherche.trim());
  const listees = q ? zones.filter((z) => sansAccent(z.nom).includes(q)) : zones;
  const affichees = choix === TOUTES ? zones : zones.filter((z) => z.cle === choix);
  // Une seule zone : l'index n'indexe rien, il ne ferait que voler de la place.
  const avecIndex = zones.length > 1;

  const entree = (zone: ZoneCatalogue) => {
    const p = prixEntree(zone);
    return Number.isFinite(p) ? ` · dès ${p.toLocaleString("fr-FR")} F` : "";
  };

  return (
    <div className={avecIndex ? "lg:grid lg:grid-cols-[16rem_1fr] lg:items-start lg:gap-6" : ""}>
      {avecIndex && (
        <aside className="lg:sticky lg:top-8">
          {/* Le champ n'apparaît que quand la liste dépasse ce qu'on lit d'un
              coup d'œil. Sur cinq zones, chercher est plus lent que regarder. */}
          {zones.length > 6 && (
            <label className="relative mb-2 block">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft"
                aria-hidden="true"
              />
              <input
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Chercher une zone"
                aria-label="Chercher une zone"
                className="w-full rounded-lg border border-line bg-paper py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink-soft focus:border-ink focus:outline-none"
              />
            </label>
          )}

          <ul
            role="list"
            className="flex snap-x gap-2 overflow-x-auto pb-2 lg:block lg:max-h-[70vh] lg:space-y-1 lg:overflow-x-visible lg:overflow-y-auto lg:pb-0"
          >
            <li className="shrink-0 lg:shrink">
              <button
                type="button"
                onClick={() => setChoix(TOUTES)}
                aria-current={choix === TOUTES ? "true" : undefined}
                className={`w-full min-w-[9rem] rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  choix === TOUTES
                    ? "bg-brand/20 font-semibold text-ink"
                    : "font-medium text-ink-soft hover:bg-clay hover:text-ink"
                }`}
              >
                Toutes les zones
                <span className="mt-0.5 block text-xs font-normal text-ink-soft">
                  {zones.length} zones
                </span>
              </button>
            </li>

            {listees.map((zone) => {
              const nbAlertes = alertes(zone);
              const actif = choix === zone.cle;
              return (
                <li key={zone.cle} className="shrink-0 lg:shrink">
                  <button
                    type="button"
                    onClick={() => setChoix(zone.cle)}
                    aria-current={actif ? "true" : undefined}
                    className={`w-full min-w-[9rem] rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                      actif
                        ? "bg-brand/20 font-semibold text-ink"
                        : "font-medium text-ink-soft hover:bg-clay hover:text-ink"
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      {nbAlertes > 0 && (
                        <span
                          className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-warn"
                          aria-hidden="true"
                        />
                      )}
                      <span className="truncate">{zone.nom}</span>
                    </span>
                    <span className="mt-0.5 block text-xs font-normal text-ink-soft">
                      {zone.forfaits.length} forfait{zone.forfaits.length > 1 ? "s" : ""}
                      {entree(zone)}
                      {nbAlertes > 0 && (
                        <span className="text-warn">
                          {" · "}
                          {nbAlertes} à revoir
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}

            {listees.length === 0 && (
              <li className="px-3 py-2 text-sm text-ink-soft">Aucune zone à ce nom.</li>
            )}
          </ul>
        </aside>
      )}

      <div className={`space-y-4 ${avecIndex ? "mt-4 lg:mt-0" : ""}`}>
        {affichees.map((zone) => {
          const regles = reglesCommunes(zone);
          const inactifs = zone.forfaits.filter((f) => !f.active).length;
          return (
            <section
              key={zone.cle}
              className="overflow-hidden rounded-xl border border-line bg-paper"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line-soft px-4 py-3">
                <h2 className="font-display text-base font-bold text-ink">{zone.nom}</h2>
                <p className="text-xs text-ink-soft">
                  {zone.forfaits.length} forfait{zone.forfaits.length > 1 ? "s" : ""}
                  {inactifs > 0 ? ` · ${inactifs} désactivé${inactifs > 1 ? "s" : ""}` : ""}
                  {regles ? ` · ${regles}` : ""}
                </p>
              </div>

              <ul role="list" className="divide-y divide-line-soft">
                {zone.forfaits.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                    <div className="min-w-0 flex-1 basis-48">
                      <p className={`font-medium ${f.active ? "text-ink" : "text-ink-soft"}`}>
                        {f.name}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-soft">
                        {libelleDuree(f.durationValue, f.durationUnit)}
                        {f.parJour !== null && ` · ≈ ${formatFcfa(f.parJour)}/jour`}
                        {!zone.debitCommun && ` · ${f.uploadMbps ?? 0}M/${f.downloadMbps ?? 0}M`}
                        {zone.commissionCommune === null &&
                          ` · commission ${formatFcfa(f.commissionCents)}`}
                        {!f.active && " · désactivé"}
                      </p>
                      {/* Une grille saine coûte de moins en moins cher par jour à
                          mesure que la durée s'allonge. Quand ce n'est pas le cas,
                          le palier ne se vendra pas — et rien, dans un tableau de
                          prix bruts, ne le faisait voir. */}
                      {f.inversion && (
                        <div className="mt-1">
                          <p className="flex items-start gap-1.5 text-xs font-medium text-warn">
                            <TriangleAlert
                              className="mt-0.5 h-3.5 w-3.5 flex-shrink-0"
                              aria-hidden="true"
                            />
                            <span>
                              Plus cher par jour que {f.inversionContre} — aucun intérêt à le
                              prendre.
                            </span>
                          </p>
                          {f.prixMax !== null && (
                            <LadderFixButton
                              packageId={f.id}
                              prixMax={f.prixMax}
                              formatted={formatFcfa(f.prixMax)}
                            />
                          )}
                        </div>
                      )}
                    </div>
                    <div className="ml-auto text-right text-base font-semibold tabular-nums text-ink">
                      <PriceEditor
                        packageId={f.id}
                        priceCents={f.priceCents}
                        formatted={formatFcfa(f.priceCents)}
                      />
                    </div>
                    <StatusToggle packageId={f.id} active={f.active} />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
