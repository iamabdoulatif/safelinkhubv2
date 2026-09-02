import { Wallet, TriangleAlert, ArrowDownToLine, Clock } from "lucide-react";
import { getGeniusPayBalance } from "@/lib/payment-gateways/actions";

/** « 1 325 000 FCFA » — montants GeniusPay en XOF entier (pas de centimes). */
function fcfa(n: number): string {
  return `${new Intl.NumberFormat("fr-FR").format(Math.round(n))} FCFA`;
}

/**
 * Carte « Solde GeniusPay » (lecture seule). Affichée uniquement quand l'org a
 * un compte GeniusPay activé. Lit GET /account/balance côté serveur — aucune
 * clé n'atteint le navigateur, aucun retrait n'est déclenché (l'API Payouts de
 * GeniusPay est encore en bêta). Le retrait se fait dans l'interface GeniusPay.
 */
export default async function GeniusBalanceCard() {
  const res = await getGeniusPayBalance();
  if (res === null) return null; // pas de compte GeniusPay actif

  return (
    <section className="mt-8">
      <div className="flex items-center gap-2">
        <Wallet aria-hidden="true" className="h-5 w-5 text-ink" />
        <h2 className="font-display text-lg font-bold text-ink">Solde GeniusPay</h2>
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        Gains encaissés sur votre compte marchand GeniusPay. Le retrait se fait
        depuis GeniusPay — SafeLinkHub ne touche jamais ces fonds.
      </p>

      {!res.ok ? (
        <p className="mt-3 flex items-center gap-2 border border-warn bg-warn/10 px-4 py-3 text-sm text-ink rounded-xl">
          <TriangleAlert aria-hidden="true" className="h-4 w-4 shrink-0 text-warn" />
          Solde momentanément indisponible : {res.error}
        </p>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="border border-ok bg-ok/5 p-4 rounded-xl">
            <div className="flex items-center gap-2 text-ok">
              <ArrowDownToLine aria-hidden="true" className="h-4 w-4" />
              <p className="font-mono text-[11px] font-bold uppercase tracking-widest">Disponible au retrait</p>
            </div>
            <p className="mt-2 font-display text-2xl font-extrabold text-ink">{fcfa(res.balance.available)}</p>
            <p className="mt-1 text-xs text-ink-soft">Retirable depuis votre compte GeniusPay.</p>
          </div>

          <div className="border border-line bg-paper p-4 rounded-xl">
            <div className="flex items-center gap-2 text-ink-soft">
              <Clock aria-hidden="true" className="h-4 w-4" />
              <p className="font-mono text-[11px] font-bold uppercase tracking-widest">En attente</p>
            </div>
            <p className="mt-2 font-display text-2xl font-extrabold text-ink">{fcfa(res.balance.pending)}</p>
            <p className="mt-1 text-xs text-ink-soft">Transactions en cours de confirmation.</p>
          </div>

          <div className="border border-line bg-paper p-4 rounded-xl">
            <div className="flex items-center gap-2 text-ink-soft">
              <Wallet aria-hidden="true" className="h-4 w-4" />
              <p className="font-mono text-[11px] font-bold uppercase tracking-widest">Solde total</p>
            </div>
            <p className="mt-2 font-display text-2xl font-extrabold text-ink">{fcfa(res.balance.total)}</p>
            <p className="mt-1 text-xs text-ink-soft">Disponible + en attente.</p>
          </div>
        </div>
      )}
    </section>
  );
}
