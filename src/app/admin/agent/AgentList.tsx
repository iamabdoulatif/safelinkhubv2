"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Banknote, Trash2, Users, X } from "lucide-react";
import { deleteAgent, sellPackageAsAgent, type AgentWithStats } from "@/lib/agents/actions";

type PackageRow = {
  id: string;
  name: string;
  priceCents: number;
  commissionCents: number;
  active: boolean;
};

function formatFcfa(cents: number) {
  // fr-FR : espace insécable comme séparateur de milliers, comme partout
  // ailleurs dans l'administration. En en-US, « 1,500 » se lit « 1,5 » pour un
  // francophone — le pire malentendu possible sur un montant.
  return `FCFA ${cents.toLocaleString("fr-FR")}`;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function DeleteAgentButton({ agentId }: { agentId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-ink-soft">Supprimer ?</span>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await deleteAgent(agentId);
              if (res?.error) setError(res.error);
              else router.refresh();
            })
          }
          className="rounded-md bg-err px-2.5 py-1 text-xs font-medium text-white hover:bg-ink disabled:opacity-60"
        >
          Confirmer
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded-md border border-line-soft px-2.5 py-1 text-xs font-medium text-ink-soft hover:bg-clay"
        >
          Annuler
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-err">{error}</span>}
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="flex items-center gap-1.5 rounded-md border border-err px-2.5 py-1 text-xs font-medium text-err hover:bg-err-soft"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Retirer
      </button>
    </div>
  );
}

function SellPackageModal({
  agent,
  packages,
  onClose,
}: {
  agent: AgentWithStats;
  packages: PackageRow[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(sellPackageAsAgent, undefined);

  useEffect(() => {
    if (state?.success) router.refresh();
  }, [state, router]);

  const activePackages = packages.filter((p) => p.active);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form action={formAction} className="max-h-[90dvh] overflow-y-auto w-full max-w-md rounded-xl bg-paper p-6">
        <input type="hidden" name="agentId" value={agent.id} />

        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">
            Vendre un forfait — {agent.name}
          </h2>
          <button type="button" onClick={onClose}>
            <X className="h-5 w-5 text-ink-soft" />
          </button>
        </div>
        <p className="mt-1 text-sm text-ink-soft">
          L&apos;agent collecte le paiement en espèces ; un voucher est généré et le
          solde flottant est crédité automatiquement du prix du forfait.
        </p>

        {state?.error && (
          <p className="mt-4 rounded-md bg-err-soft px-3 py-2 text-sm text-err">{state.error}</p>
        )}

        {state?.success && (
          <div className="mt-4 rounded-md bg-clay px-3 py-2.5 text-sm text-ok">
            <p className="font-medium">Vente enregistrée — {state.packageName}</p>
            <p className="mt-1">
              Voucher :{" "}
              <span className="rounded bg-clay px-1.5 py-0.5 font-mono font-semibold">
                {state.voucherCode}
              </span>{" "}
              ({formatFcfa(state.priceCents ?? 0)})
            </p>
          </div>
        )}

        {activePackages.length === 0 ? (
          <p className="mt-4 rounded-md bg-clay px-3 py-2 text-sm text-warn">
            Aucun forfait actif — créez-en un depuis la page Forfaits avant de vendre.
          </p>
        ) : (
          <div className="mt-5 space-y-2">
            {activePackages.map((pkg) => (
              <label
                key={pkg.id}
                className="flex cursor-pointer items-center justify-between rounded-md border border-line-soft px-3 py-2.5 text-sm hover:bg-clay"
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="packageId"
                    value={pkg.id}
                    required
                    className="h-4 w-4 border-line-soft"
                  />
                  <span className="font-medium text-ink">{pkg.name}</span>
                </span>
                <span className="text-right text-xs text-ink-soft">
                  <span className="font-semibold text-ink">{formatFcfa(pkg.priceCents)}</span>
                  <br />
                  commission {formatFcfa(pkg.commissionCents)}
                </span>
              </label>
            ))}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-line-soft px-4 py-2 text-sm font-medium text-ink-soft hover:bg-clay"
          >
            Fermer
          </button>
          {activePackages.length > 0 && (
            <button
              type="submit"
              disabled={pending}
              className="flex items-center gap-1.5 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-slate-deep-line disabled:opacity-60"
            >
              <Banknote className="h-4 w-4" />
              {pending ? "Enregistrement..." : "Encaisser & générer le voucher"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

export default function AgentList({
  agents,
  packages,
}: {
  agents: AgentWithStats[];
  packages: PackageRow[];
}) {
  const [sellingFor, setSellingFor] = useState<AgentWithStats | null>(null);
  const totaux = agents.reduce(
    (a, agent) => ({
      ventes: a.ventes + agent.salesCount,
      revenu: a.revenu + agent.revenueCents,
      commission: a.commission + agent.commissionCents,
    }),
    { ventes: 0, revenu: 0, commission: 0 },
  );

  if (agents.length === 0) {
    return (
      <div className="mt-6 rounded-xl border border-dashed border-line-soft bg-paper px-6 py-10 text-center">
        <Users className="mx-auto h-8 w-8 text-clay" />
        <p className="mt-2 text-sm font-medium text-ink-soft">Aucun agent pour le moment</p>
        <p className="mt-1 text-sm text-ink-soft">
          Ajoutez un agent pour commencer à vendre des forfaits en espèces sur le terrain.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="mt-6 overflow-hidden rounded-xl border border-line bg-paper">
        {/* Cartes sous md. Dans la table, la colonne d'actions était la
            DERNIÈRE : sur un téléphone, il fallait faire défiler jusqu'au bout
            pour atteindre « Vendre » — l'action principale de cet écran. */}
        <ul role="list" className="divide-y divide-line-soft md:hidden">
          {agents.map((agent) => (
            <li key={`m-${agent.id}`} className="p-4">
              <p className="font-medium text-ink">{agent.name}</p>
              <p className="text-xs text-ink-soft">{agent.email}</p>
              <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs">
                <div className="flex gap-1.5">
                  <dt className="text-ink-soft">Ventes</dt>
                  <dd className="font-semibold tabular-nums text-ink">{agent.salesCount}</dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="text-ink-soft">Revenu</dt>
                  <dd className="tabular-nums text-ink">{formatFcfa(agent.revenueCents)}</dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="text-ink-soft">Commission due</dt>
                  <dd className="font-semibold tabular-nums text-ink">{formatFcfa(agent.commissionCents)}</dd>
                </div>
              </dl>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSellingFor(agent)}
                  className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-md bg-ink px-3 text-sm font-medium text-white hover:bg-slate-deep-line"
                >
                  <Banknote className="h-4 w-4" />
                  Vendre
                </button>
                <DeleteAgentButton agentId={agent.id} />
              </div>
            </li>
          ))}
        </ul>

        <table className="hidden w-full text-left text-sm md:table">
          <thead className="border-b border-line-soft bg-clay text-ink-soft">
            <tr>
              <th className="px-4 py-3 font-medium">Agent</th>
              <th className="px-4 py-3 text-right font-medium">Ventes</th>
              <th className="px-4 py-3 text-right font-medium">Revenu généré</th>
              <th className="px-4 py-3 text-right font-medium">Commission due</th>
              <th className="px-4 py-3 font-medium">Depuis</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {agents.map((agent) => (
              <tr key={agent.id} className="hover:bg-clay">
                <td className="px-4 py-3">
                  <p className="font-medium text-ink">{agent.name}</p>
                  <p className="text-xs text-ink-soft">{agent.email}</p>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-ink">{agent.salesCount}</td>
                {/* Tous les agents génèrent du revenu : le peindre en vert
                    partout ne désigne personne. */}
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-ink">
                  {formatFcfa(agent.revenueCents)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums text-ink">
                  {formatFcfa(agent.commissionCents)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-ink-soft">{formatDate(agent.createdAt)}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setSellingFor(agent)}
                      className="flex items-center gap-1.5 rounded-md bg-ink px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-deep-line"
                    >
                      <Banknote className="h-3.5 w-3.5" />
                      Vendre
                    </button>
                    <DeleteAgentButton agentId={agent.id} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          {/* Ce qu'on vient chercher ici avant de payer la tournée : combien
              est dû, au total. On l'additionnait à la main. */}
          <tfoot className="border-t border-line bg-clay">
            <tr className="font-semibold text-ink">
              <td className="px-4 py-3">{agents.length} agent{agents.length > 1 ? "s" : ""}</td>
              <td className="px-4 py-3 text-right tabular-nums">{totaux.ventes}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatFcfa(totaux.revenu)}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatFcfa(totaux.commission)}</td>
              <td className="px-4 py-3" colSpan={2} />
            </tr>
          </tfoot>
        </table>
        <p className="border-t border-line-soft px-4 py-3 text-xs text-ink-soft md:hidden">
          {agents.length} agent{agents.length > 1 ? "s" : ""} · {formatFcfa(totaux.commission)} de
          commission due au total.
        </p>
      </div>

      {sellingFor && (
        <SellPackageModal
          agent={sellingFor}
          packages={packages}
          onClose={() => setSellingFor(null)}
        />
      )}
    </>
  );
}
