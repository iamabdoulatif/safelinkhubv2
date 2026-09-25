"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { updateRouterPortalContacts } from "@/lib/captive-templates/actions";
import PriceEditor from "../../packages/PriceEditor";

export type PortalContacts = {
  supportWhatsapp: string;
  supportPhone: string;
  vendors: { name: string; location: string; phone: string }[];
};
export type PortalPlan = { id: string; name: string; priceCents: number; validity: string; shared: boolean };

/**
 * Ce que le portail d'UN routeur affiche et qu'on doit pouvoir changer sans
 * refaire l'auto-setup : ses numéros (WhatsApp, téléphone, vendeurs) et le
 * prix de ses forfaits. Chaque enregistrement ré-envoie le portail au MikroTik.
 */
export default function RouterPortalSettings({
  routerId,
  contacts,
  plans,
  hasPortal,
}: {
  routerId: string;
  contacts: PortalContacts;
  plans: PortalPlan[];
  hasPortal: boolean;
}) {
  const [state, action, pending] = useActionState(updateRouterPortalContacts, undefined);
  // Clé stable par ligne : avec l'index, retirer un vendeur du milieu
  // décalait les valeurs des champs (non contrôlés) des lignes suivantes.
  const [vendors, setVendors] = useState(() => contacts.vendors.map((v, i) => ({ ...v, k: i })));
  const [nextKey, setNextKey] = useState(contacts.vendors.length);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <form action={action} className="rounded-xl border border-line p-4">
        <input type="hidden" name="routerId" value={routerId} />
        <h3 className="text-sm font-semibold text-ink">Contacts du portail</h3>
        <p className="mt-0.5 text-xs text-ink-soft">Numéros affichés à vos clients sur la page de connexion.</p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-ink-soft">
            WhatsApp
            <input name="supportWhatsapp" defaultValue={contacts.supportWhatsapp} inputMode="tel" placeholder="+225 07 00 00 00 00" className="field mt-1" />
          </label>
          <label className="block text-xs font-medium text-ink-soft">
            Téléphone
            <input name="supportPhone" defaultValue={contacts.supportPhone} inputMode="tel" placeholder="+225 05 00 00 00 00" className="field mt-1" />
          </label>
        </div>

        <fieldset className="mt-4">
          <legend className="text-xs font-medium text-ink-soft">Vendeurs de tickets</legend>
          <div className="mt-1.5 space-y-2">
            {vendors.map((v, i) => (
              <div key={v.k} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-1.5">
                <input name="vendorName" defaultValue={v.name} aria-label={`Nom du vendeur ${i + 1}`} placeholder="Nom" className="field" />
                <input name="vendorLocation" defaultValue={v.location} aria-label={`Lieu du vendeur ${i + 1}`} placeholder="Lieu" className="field" />
                <input name="vendorPhone" defaultValue={v.phone} aria-label={`Téléphone du vendeur ${i + 1}`} inputMode="tel" placeholder="Téléphone" className="field" />
                <button
                  type="button"
                  onClick={() => setVendors((list) => list.filter((x) => x.k !== v.k))}
                  aria-label={`Retirer le vendeur ${i + 1}`}
                  className="rounded-lg px-2 text-ink-soft hover:bg-err-soft hover:text-err"
                >
                  <Trash2 aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setVendors((list) => [...list, { name: "", location: "", phone: "", k: nextKey }]);
              setNextKey((n) => n + 1);
            }}
            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-ink hover:underline"
          >
            <Plus aria-hidden="true" className="h-3.5 w-3.5" /> Ajouter un vendeur
          </button>
        </fieldset>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button disabled={pending} className="btn btn-md btn-secondary inline-flex items-center gap-2">
            {pending && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
            {pending ? "Mise à jour du routeur…" : hasPortal ? "Enregistrer et mettre à jour le portail" : "Enregistrer"}
          </button>
        </div>
        {state && (
          <p
            role="status"
            className={`mt-3 rounded-lg px-3 py-2 text-sm ${"error" in state ? "bg-err-soft text-err" : "bg-ok-soft text-ok"}`}
          >
            {"error" in state ? state.error : state.summary}
          </p>
        )}
      </form>

      <div className="rounded-xl border border-line p-4">
        <h3 className="text-sm font-semibold text-ink">Forfaits affichés</h3>
        <p className="mt-0.5 text-xs text-ink-soft">
          Modifiez un prix : le portail de ce routeur est mis à jour dans la foulée.
        </p>
        {plans.length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft">Aucun forfait actif pour ce routeur.</p>
        ) : (
          <ul role="list" className="mt-3 divide-y divide-line-soft">
            {plans.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">{p.name}</span>
                  <span className="block text-xs text-ink-soft">
                    {p.validity}
                    {p.shared && " · commun à tous les routeurs"}
                  </span>
                </span>
                <span className="text-sm font-semibold tabular-nums text-ink">
                  <PriceEditor packageId={p.id} priceCents={p.priceCents} formatted={`${p.priceCents.toLocaleString("fr-FR")} FCFA`} />
                </span>
              </li>
            ))}
          </ul>
        )}
        <Link href="/admin/packages" className="mt-3 inline-block text-xs font-semibold text-ink hover:underline">
          Gérer tous les forfaits
        </Link>
      </div>
    </div>
  );
}
