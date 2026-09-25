"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Globe2, Router as RouterIcon, X } from "lucide-react";
import { generateVouchers } from "@/lib/vouchers/actions";
import { generateRoamingVouchers } from "@/lib/roaming/actions";

type PackageOption = {
  id: string;
  name: string;
  priceCents: number;
  durationValue: number;
  durationUnit: string;
  /** null = forfait commun à tous les routeurs de l'organisation. */
  routerId: string | null;
  active: boolean;
};
type RouterOption = { id: string; name: string; status: string };
type RoamingOffer = {
  id: string;
  profileName: string;
  durationValue: number;
  durationUnit: string;
  uploadMbps: number;
  downloadMbps: number;
  priceCents: number;
};
type RoamingGroup = { id: string; name: string; zones: number; zonesOnline: number; offers: RoamingOffer[] };
type Mode = "zone" | "roaming";

const UNITS: Record<string, [string, string]> = {
  Minutes: ["minute", "minutes"],
  Hours: ["heure", "heures"],
  Days: ["jour", "jours"],
  Weeks: ["semaine", "semaines"],
  Months: ["mois", "mois"],
};
function duration(value: number, unit: string) {
  if (unit === "Unlimited") return "Illimité";
  const [one, many] = UNITS[unit] ?? [unit, unit];
  return `${value} ${value > 1 ? many : one}`;
}
const money = (n: number) => `${n.toLocaleString("fr-FR")} FCFA`;

/**
 * Génération de tickets en deux modes.
 *
 * ZONE : on coche d'abord les zones, et seuls LEURS forfaits (plus les forfaits
 * communs à tous les routeurs) sont proposés — la liste plate de tous les
 * forfaits de l'organisation alignait des « 01-SEMAINE » identiques sans dire à
 * quelle zone ils appartenaient.
 *
 * ROAMING : on choisit un groupe, et ce sont ses offres (profil, vitesse, prix)
 * qui s'affichent ; le code est valable sur toutes les zones du groupe.
 */
export default function GenerateVouchersModal({
  packages,
  routers,
  roaming = [],
}: {
  packages: PackageOption[];
  routers: RouterOption[];
  roaming?: RoamingGroup[];
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("zone");
  const [zoneState, zoneAction, zonePending] = useActionState(generateVouchers, undefined);
  const [roamState, roamAction, roamPending] = useActionState(generateRoamingVouchers, undefined);

  const firstOnline = routers.find((r) => r.status === "online")?.id ?? routers[0]?.id;
  const [zones, setZones] = useState<string[]>(firstOnline ? [firstOnline] : []);
  const [packageId, setPackageId] = useState<string | null>(null);
  const [groupId, setGroupId] = useState<string | null>(roaming[0]?.id ?? null);
  const [offerId, setOfferId] = useState<string | null>(null);

  // Forfaits proposés : ceux des zones cochées, puis les forfaits communs.
  const groups = useMemo(() => {
    const active = packages.filter((p) => p.active);
    const byZone = zones
      .map((id) => ({
        key: id,
        title: routers.find((r) => r.id === id)?.name ?? "Zone",
        items: active.filter((p) => p.routerId === id),
      }))
      .filter((g) => g.items.length > 0);
    const shared = active.filter((p) => p.routerId === null);
    return shared.length ? [...byZone, { key: "shared", title: "Tous les routeurs", items: shared }] : byZone;
  }, [packages, routers, zones]);
  const offered = groups.flatMap((g) => g.items);
  const chosenPackage = offered.find((p) => p.id === packageId) ?? null;
  const group = roaming.find((g) => g.id === groupId) ?? null;
  const chosenOffer = group?.offers.find((o) => o.id === offerId) ?? null;

  // Fermer après un succès (ajustement pendant le rendu, pas dans un effet).
  const [seen, setSeen] = useState({ zoneState, roamState });
  if (seen.zoneState !== zoneState || seen.roamState !== roamState) {
    setSeen({ zoneState, roamState });
    if (zoneState?.success || roamState?.success) setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function toggleZone(id: string) {
    setZones((z) => (z.includes(id) ? z.filter((x) => x !== id) : [...z, id]));
  }

  const state = mode === "zone" ? zoneState : roamState;
  const pending = zonePending || roamPending;
  const canSubmit =
    mode === "zone" ? zones.length > 0 && chosenPackage !== null : group !== null && chosenOffer !== null;

  const common = (
    <div className="grid grid-cols-2 gap-3">
      <label className="block text-sm font-medium text-ink">
        Quantité
        <input name="quantity" type="number" min={1} max={200} defaultValue={10} required className="field mt-1" />
      </label>
      <label className="block text-sm font-medium text-ink">
        Préfixe <span className="font-normal text-ink-soft">(optionnel)</span>
        <input name="prefix" maxLength={10} placeholder="ex : fatou" className="field mt-1" />
      </label>
      <label className="col-span-2 block text-sm font-medium text-ink">
        Note <span className="font-normal text-ink-soft">(optionnel)</span>
        <input name="note" maxLength={180} placeholder="ex : lot marché samedi" className="field mt-1" />
      </label>
    </div>
  );

  const option = (props: {
    name: string;
    value: string;
    checked: boolean;
    onChange: () => void;
    title: string;
    meta: string;
    price: string;
  }) => (
    <label
      key={props.value}
      className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 ${
        props.checked ? "border-slate-deep bg-clay/60" : "border-line hover:bg-clay/40"
      }`}
    >
      <input type="radio" name={props.name} value={props.value} checked={props.checked} onChange={props.onChange} className="sr-only" />
      <span
        aria-hidden="true"
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${props.checked ? "border-slate-deep" : "border-line-strong"}`}
      >
        {props.checked && <span className="h-2 w-2 rounded-full bg-slate-deep" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-ink">{props.title}</span>
        <span className="block text-xs text-ink-soft">{props.meta}</span>
      </span>
      <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">{props.price}</span>
    </label>
  );

  return (
    <>
      <button onClick={() => setOpen(true)} type="button" className="btn btn-md btn-primary">
        Générer des tickets
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
          <div className="absolute inset-0 bg-ink/45" aria-hidden="true" onClick={() => setOpen(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="generate-title"
            className="relative flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-paper shadow-modal sm:rounded-2xl"
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 id="generate-title" className="text-lg font-semibold text-ink">Générer des tickets</h2>
              <button type="button" aria-label="Fermer" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-ink-soft hover:bg-clay">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-y-auto px-5 py-4">
              <div role="radiogroup" aria-label="Type de tickets" className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-clay/60 p-1">
                {(
                  [
                    ["zone", "Zone Wi-Fi", RouterIcon, "Un ou plusieurs routeurs"],
                    ["roaming", "Roaming", Globe2, roaming.length ? `${roaming.length} groupe(s)` : "Aucun groupe"],
                  ] as const
                ).map(([id, label, Icon, hint]) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={mode === id}
                    disabled={id === "roaming" && roaming.length === 0}
                    onClick={() => setMode(id)}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-left disabled:opacity-50 ${
                      mode === id ? "bg-paper shadow-menu" : "hover:bg-paper/60"
                    }`}
                  >
                    <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-soft" />
                    <span>
                      <span className={`block text-sm text-ink ${mode === id ? "font-semibold" : ""}`}>{label}</span>
                      <span className="block text-xs text-ink-soft">{hint}</span>
                    </span>
                  </button>
                ))}
              </div>

              <div className="mt-4" aria-live="polite">
                {state?.error && (
                  <p className="flex items-center gap-2 rounded-lg bg-err-soft px-3 py-2 text-sm text-err">
                    <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" /> {state.error}
                  </p>
                )}
                {state?.success && (
                  <p className="flex items-center gap-2 rounded-lg bg-ok-soft px-3 py-2 text-sm text-ok">
                    <CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0" /> Tickets générés.
                  </p>
                )}
              </div>

              {mode === "zone" ? (
                <form id="generate-form" action={zoneAction} className="space-y-5">
                  <fieldset>
                    <legend className="text-sm font-semibold text-ink">1. Zones Wi-Fi</legend>
                    <p className="mt-0.5 text-xs text-ink-soft">Le même code est créé sur chaque zone cochée. Chaque routeur doit être en ligne.</p>
                    {routers.length === 0 ? (
                      <p className="mt-2 text-sm text-ink-soft">Aucun routeur.</p>
                    ) : (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {routers.map((r) => {
                          const on = zones.includes(r.id);
                          const online = r.status === "online";
                          return (
                            <label
                              key={r.id}
                              className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${
                                on ? "border-slate-deep bg-slate-deep text-white" : "border-line text-ink hover:bg-clay/50"
                              }`}
                            >
                              <input type="checkbox" name="routerIds" value={r.id} checked={on} onChange={() => toggleZone(r.id)} className="sr-only" />
                              <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${online ? "bg-ok" : "bg-err"}`} />
                              {r.name}
                              {!online && <span className="sr-only">(hors ligne)</span>}
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </fieldset>

                  <fieldset>
                    <legend className="text-sm font-semibold text-ink">2. Forfait</legend>
                    {zones.length === 0 ? (
                      <p className="mt-2 rounded-lg bg-clay/60 px-3 py-2.5 text-sm text-ink-soft">Cochez une zone pour voir ses forfaits.</p>
                    ) : groups.length === 0 ? (
                      <p className="mt-2 rounded-lg bg-clay/60 px-3 py-2.5 text-sm text-ink-soft">
                        Aucun forfait actif pour ces zones. Créez-en dans Vente → Forfaits.
                      </p>
                    ) : (
                      <div className="mt-2 space-y-3">
                        {groups.map((g) => (
                          <div key={g.key}>
                            <p className="mb-1.5 text-xs font-medium text-ink-soft">{g.title}</p>
                            <div className="space-y-1.5">
                              {g.items.map((p) =>
                                option({
                                  name: "packageId",
                                  value: p.id,
                                  checked: packageId === p.id,
                                  onChange: () => setPackageId(p.id),
                                  title: p.name,
                                  meta: duration(p.durationValue, p.durationUnit),
                                  price: money(p.priceCents),
                                }),
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </fieldset>

                  <fieldset>
                    <legend className="mb-2 text-sm font-semibold text-ink">3. Lot</legend>
                    {common}
                  </fieldset>
                </form>
              ) : (
                <form id="generate-form" action={roamAction} className="space-y-5">
                  <input type="hidden" name="groupId" value={groupId ?? ""} />
                  <fieldset>
                    <legend className="text-sm font-semibold text-ink">1. Groupe roaming</legend>
                    <p className="mt-0.5 text-xs text-ink-soft">Le code est valable sur toutes les zones du groupe.</p>
                    <div className="mt-2 space-y-1.5">
                      {roaming.map((g) =>
                        option({
                          name: "roamingGroup",
                          value: g.id,
                          checked: groupId === g.id,
                          onChange: () => {
                            setGroupId(g.id);
                            setOfferId(null);
                          },
                          title: g.name,
                          meta: `${g.zonesOnline}/${g.zones} zone(s) en ligne · ${g.offers.length} offre(s)`,
                          price: "",
                        }),
                      )}
                    </div>
                  </fieldset>

                  <fieldset>
                    <legend className="text-sm font-semibold text-ink">2. Offre du groupe</legend>
                    {!group || group.offers.length === 0 ? (
                      <p className="mt-2 rounded-lg bg-clay/60 px-3 py-2.5 text-sm text-ink-soft">
                        Aucune offre active pour ce groupe. Ajoutez-en dans Réseau → Roaming → Catalogue.
                      </p>
                    ) : (
                      <div className="mt-2 space-y-1.5">
                        {group.offers.map((o) =>
                          option({
                            name: "offerId",
                            value: o.id,
                            checked: offerId === o.id,
                            onChange: () => setOfferId(o.id),
                            title: o.profileName,
                            meta: `${duration(o.durationValue, o.durationUnit)} · ${o.downloadMbps}/${o.uploadMbps} Mbit/s`,
                            price: money(o.priceCents),
                          }),
                        )}
                      </div>
                    )}
                  </fieldset>

                  <fieldset>
                    <legend className="mb-2 text-sm font-semibold text-ink">3. Lot</legend>
                    {common}
                  </fieldset>
                </form>
              )}
            </div>

            {/* Récapitulatif : on sait ce qu'on émet avant de cliquer. */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-clay/30 px-5 py-3.5">
              <p className="min-w-0 text-xs text-ink-soft">
                {mode === "zone"
                  ? chosenPackage
                    ? `${chosenPackage.name} · ${money(chosenPackage.priceCents)} · ${zones.length} zone(s)`
                    : "Choisissez un forfait"
                  : chosenOffer && group
                    ? `${chosenOffer.profileName} · ${money(chosenOffer.priceCents)} · ${group.name}`
                    : "Choisissez une offre"}
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setOpen(false)} className="btn btn-md btn-ghost">
                  Annuler
                </button>
                <button type="submit" form="generate-form" disabled={pending || !canSubmit} className="btn btn-md btn-secondary">
                  {pending ? "Génération…" : "Générer"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
