import type { ConversionDay, ConversionTotals, PendingPayment } from "./conversion-data";

/* VUE de la page Conversion — présentation pure, aucune requête.
 *
 * Séparée de page.tsx pour deux raisons : elle se rend avec des données
 * d'exemple (donc se relit et se teste sans base), et la page redevient ce
 * qu'elle doit être — trois requêtes et un calcul.
 *
 * PARTI PRIS DE LECTURE. La page s'appelle « entonnoir » : elle en DESSINE un,
 * au lieu d'aligner quatre cartes de même poids et deux pastilles de taux.
 * Un tableau de bord doit répondre à une question — « où perd-on les
 * clients ? » — pas réciter des compteurs. D'où :
 *   • un seul chiffre héros (le taux de conversion), le reste en appui ;
 *   • trois barres à l'échelle des volumes, et entre elles, en toutes lettres,
 *     ce qui se perd d'une marche à l'autre ;
 *   • une couleur qui veut dire quelque chose : le vert ne sert QU'à ce qui a
 *     été payé. Colorer chaque nombre (un « 0 » en vert, un « 3 » en orange)
 *     ne hiérarchise rien, ça bariole ;
 *   • des barres journalières proportionnelles au volume DU JOUR, pas
 *     ramenées à 100 % — sinon un jour à 3 commandes paraît aussi gros qu'un
 *     jour à 41, ce qui est faux et fait prendre de mauvaises décisions.
 */

function fmtDay(d: string) {
  const date = new Date(d);
  return date.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit" });
}

function fmtDate(d: string) {
  return new Date(d).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

// priceCents stocke le montant EN FCFA directement (voir pay/route.ts :
// amountFcfa = order.priceCents), pas des centimes — donc pas de division.
function fcfa(amount: number) {
  return `${Math.round(amount).toLocaleString("fr-FR")} F`;
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** Une marche de l'entonnoir : libellé, barre à l'échelle, compte. */
function Etape({
  label,
  value,
  total,
  accent = false,
  hint,
}: {
  label: string;
  value: number;
  total: number;
  accent?: boolean;
  hint?: string;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-1 sm:grid-cols-[11rem_1fr_auto]">
      <p className="text-sm font-semibold text-ink sm:order-1">{label}</p>
      <p className="text-right sm:order-3">
        <span className={`font-display text-xl font-extrabold tabular-nums ${accent ? "text-ok" : "text-ink"}`}>
          {value.toLocaleString("fr-FR")}
        </span>
        <span className="ml-1.5 text-xs text-ink-soft">{pct(value, total)}%</span>
      </p>
      {/* La barre passe sous le libellé en dessous de sm : à 375 px, trois
          colonnes donneraient une barre de deux centimètres, illisible. */}
      <div
        className="col-span-2 h-2.5 rounded-full bg-clay sm:order-2 sm:col-span-1"
        role="img"
        aria-label={`${label} : ${value} commandes, ${pct(value, total)}%`}
      >
        <div
          className={`h-full rounded-full ${accent ? "bg-ok" : "bg-ink"}`}
          // Plancher de 1,5 % : une marche à cinq commandes doit rester
          // VISIBLE, sans pour autant mentir sur sa taille.
          style={{ width: `${value > 0 ? Math.max(pct(value, total), 1.5) : 0}%` }}
        />
      </div>
      {hint && <p className="col-span-2 text-xs text-ink-soft sm:order-4 sm:col-span-3">{hint}</p>}
    </div>
  );
}

/** Ce qui se perd ENTRE deux marches, en toutes lettres. */
function Chute({ perdus, base, raison }: { perdus: number; base: number; raison: string }) {
  if (perdus <= 0) return null;
  return (
    <p className="border-l-2 border-err-soft py-1 pl-3 text-xs leading-5 text-ink-soft">
      <span className="font-semibold text-err">−{perdus.toLocaleString("fr-FR")}</span>{" "}
      <span className="tabular-nums">({pct(perdus, base)}%)</span> {raison}
    </p>
  );
}

export default function ConversionView({
  daily,
  sum,
  pendingPayments,
  allOrgs,
}: {
  daily: ConversionDay[];
  sum: ConversionTotals;
  pendingPayments: PendingPayment[];
  allOrgs: boolean;
}) {
  const engages = sum.paid + sum.reached;
  const convRate = pct(sum.paid, sum.total);
  // Échelle des barres journalières : le jour le plus chargé fait la largeur
  // pleine. C'est ce qui rend deux journées comparables d'un coup d'œil.
  const maxTotal = daily.reduce((m, r) => Math.max(m, r.total), 0);

  const enTete = (
    <header>
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
        Conversion du portail captif
      </h1>
      <p className="mt-1 text-sm text-ink-soft">
        Ce que deviennent les commandes lancées depuis le portail, sur les 14 derniers jours
        {allOrgs ? ", toutes organisations confondues" : ""}.
      </p>
    </header>
  );

  if (sum.total === 0) {
    return (
      <div className="mx-auto max-w-4xl">
        {enTete}
        <div className="mt-8 rounded-2xl border border-dashed border-line-soft bg-paper p-10 text-center">
          <p className="font-display text-lg font-bold text-ink">Aucune commande sur la période</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-soft">
            Dès qu&apos;un client lancera un achat depuis un portail captif, vous verrez ici où il
            s&apos;arrête : au choix du moyen de paiement, au paiement lui-même, ou jusqu&apos;au bout.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      {enTete}

      {/* ── Le chiffre qui compte, et l'entonnoir qui l'explique ───────────── */}
      <section className="mt-6 rounded-2xl border border-line bg-paper">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 border-b border-line-soft p-5 sm:p-6">
          <div>
            <p className="text-sm text-ink-soft">Commandes menées jusqu&apos;au paiement</p>
            <p className="mt-1 flex items-baseline gap-2">
              <span className="font-display text-4xl font-extrabold tabular-nums text-ink sm:text-5xl">
                {convRate}%
              </span>
              <span className="text-sm text-ink-soft">
                {sum.paid.toLocaleString("fr-FR")} sur {sum.total.toLocaleString("fr-FR")}
              </span>
            </p>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-sm text-ink-soft">Encaissé</p>
            <p className="mt-1 font-display text-2xl font-extrabold tabular-nums text-ink">
              {fcfa(sum.revenue)}
            </p>
          </div>
        </div>

        <div className="space-y-3 p-5 sm:p-6">
          <Etape
            label="Commandes créées"
            value={sum.total}
            total={sum.total}
          />
          <Chute
            perdus={sum.abandoned}
            base={sum.total}
            raison="sont reparties sans même choisir de moyen de paiement."
          />
          <Etape
            label="Paiement engagé"
            value={engages}
            total={sum.total}
            hint="Une référence de paiement a été créée chez l'opérateur."
          />
          <Chute
            perdus={sum.reached}
            base={engages}
            raison="se sont arrêtées au paiement : code non validé, solde insuffisant, ou délai dépassé."
          />
          <Etape
            label="Payé"
            value={sum.paid}
            total={sum.total}
            accent
          />
        </div>
      </section>

      {/* ── Jour par jour ─────────────────────────────────────────────────── */}
      <section className="mt-8">
        <h2 className="font-display text-lg font-bold text-ink">Jour par jour</h2>
        <p className="mt-1 text-sm text-ink-soft">
          La barre montre le volume du jour, à l&apos;échelle de la journée la plus chargée.
        </p>

        {/* Mobile : une carte par jour. Six colonnes serrées dans 375 px ne se
            lisent pas, et un défilement horizontal cache la moitié des jours. */}
        <ul role="list" className="mt-4 space-y-2 md:hidden">
          {daily.map((r) => (
            <li key={r.day} className="rounded-xl border border-line bg-paper p-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold text-ink">{fmtDay(r.day)}</span>
                <span className="text-sm text-ink-soft">
                  <span className="font-display font-bold tabular-nums text-ink">{r.total}</span> commandes
                </span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-clay" aria-hidden="true">
                <div className="h-full rounded-full bg-ink" style={{ width: `${pct(r.total, maxTotal)}%` }} />
              </div>
              <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs">
                <div className="flex gap-1.5">
                  <dt className="text-ink-soft">Payé</dt>
                  {/* Même écriture que dans la table : un tiret pour « rien »,
                      le vert réservé à ce qui a réellement été payé. */}
                  <dd className={`tabular-nums font-semibold ${r.paid > 0 ? "text-ok" : "text-ink-soft"}`}>
                    {r.paid || "—"}
                  </dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="text-ink-soft">Engagé</dt>
                  <dd className="tabular-nums font-semibold text-ink">{r.reached}</dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="text-ink-soft">Perdu avant</dt>
                  <dd className="tabular-nums font-semibold text-ink">{r.abandoned}</dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="text-ink-soft">Conversion</dt>
                  <dd className="tabular-nums font-semibold text-ink">{pct(r.paid, r.total)}%</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>

        <div className="mt-4 hidden overflow-hidden rounded-xl border border-line bg-paper md:block">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line-soft bg-clay">
              <tr className="text-xs font-semibold text-ink-soft">
                <th scope="col" className="px-4 py-3 font-semibold">Jour</th>
                <th scope="col" className="px-4 py-3 font-semibold">Volume</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Payé</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Engagé</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Perdu avant</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Conversion</th>
              </tr>
            </thead>
            <tbody>
              {daily.map((r) => (
                <tr key={r.day} className="border-b border-line-soft last:border-0 hover:bg-clay">
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-ink">{fmtDay(r.day)}</td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-32 shrink-0 rounded-full bg-clay" aria-hidden="true">
                        <span
                          className="block h-full rounded-full bg-ink"
                          style={{ width: `${pct(r.total, maxTotal)}%` }}
                        />
                      </span>
                      <span className="tabular-nums text-xs text-ink-soft">{r.total}</span>
                    </span>
                  </td>
                  {/* Le vert ne sert qu'à ce qui a été payé, et seulement quand
                      il y en a : un « 0 » en vert ne dit rien de bon. */}
                  <td className={`px-4 py-3 text-right tabular-nums ${r.paid > 0 ? "font-bold text-ok" : "text-ink-soft"}`}>
                    {r.paid || "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink">{r.reached || "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink">{r.abandoned || "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-ink">
                    {pct(r.paid, r.total)}%
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-line bg-clay">
              <tr className="text-sm font-semibold text-ink">
                <td className="px-4 py-3">Total</td>
                <td className="px-4 py-3 tabular-nums text-ink-soft">{sum.total}</td>
                <td className="px-4 py-3 text-right tabular-nums text-ok">{sum.paid}</td>
                <td className="px-4 py-3 text-right tabular-nums">{sum.reached}</td>
                <td className="px-4 py-3 text-right tabular-nums">{sum.abandoned}</td>
                <td className="px-4 py-3 text-right tabular-nums">{convRate}%</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <p className="mt-3 text-xs leading-5 text-ink-soft">
          <strong className="font-semibold text-ink">Engagé</strong> : le client est arrivé jusqu&apos;au
          paiement (une référence a été créée) sans le finaliser.{" "}
          <strong className="font-semibold text-ink">Perdu avant</strong> : la commande a été créée,
          mais aucun moyen de paiement n&apos;a jamais été choisi.
        </p>
      </section>

      {/* ── Ce qui demande une vérification humaine ───────────────────────── */}
      {pendingPayments.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-lg font-bold text-ink">
            À vérifier{" "}
            <span className="ml-1 rounded-full bg-warn-soft px-2 py-0.5 align-middle text-xs font-semibold tabular-nums text-warn">
              {pendingPayments.length}
            </span>
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Ces références existent chez l&apos;opérateur mais ne sont pas confirmées : elles ne comptent
            pas dans l&apos;encaissé, et méritent un coup d&apos;œil avant d&apos;être oubliées.
          </p>

          <ul role="list" className="mt-4 space-y-2">
            {pendingPayments.map((payment) => (
              <li
                key={payment.id}
                className="rounded-xl border border-line bg-paper p-4 sm:flex sm:items-start sm:justify-between sm:gap-6"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-ink">
                    {payment.phone}
                    <span className="ml-2 text-sm font-normal text-ink-soft">
                      {payment.profile_name ?? "Forfait"} · {fcfa(payment.price_cents ?? 0)}
                    </span>
                  </p>
                  <p className="mt-1 text-xs leading-5 text-ink-soft">
                    {payment.failure_reason ?? "En attente de confirmation de l'opérateur."}
                  </p>
                  <p className="mt-1 truncate font-mono text-xs text-ink-soft" title={payment.payment_reference}>
                    {payment.payment_reference}
                  </p>
                </div>
                <p className="mt-2 shrink-0 whitespace-nowrap text-xs text-ink-soft sm:mt-0 sm:text-right">
                  {fmtDate(payment.created_at)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
