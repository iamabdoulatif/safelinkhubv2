"use client";

import { useActionState, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { updateOrganizationVpnQuota } from "@/lib/billing/actions";
import { ROUTER_QUOTA_INHERIT, VPN_QUOTA_GRANT_OPTIONS } from "@/lib/billing/vpn-quota";

export type QuotaRouter = { id: string; name: string; quotaLabel: string };

export default function VpnQuotaForm({
  userId,
  userEmail,
  routers,
}: {
  userId: string;
  userEmail: string;
  /* Routeurs de l'organisation. Un compte peut en porter plusieurs et n'avoir
     qu'une zone offerte : sans cette portée, offrir un mois les offrait tous. */
  routers: QuotaRouter[];
}) {
  const [state, formAction, pending] = useActionState(updateOrganizationVpnQuota, null);
  const [routerId, setRouterId] = useState("");
  const cible = routers.find((router) => router.id === routerId);

  return (
    <div className="flex flex-col gap-1.5">
      <form action={formAction} className="flex flex-col gap-2">
        <input type="hidden" name="userId" value={userId} />

        <select
            name="grant"
            disabled={pending}
            className="h-9 w-full rounded-md border border-line bg-paper px-2 text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:opacity-60"
            aria-label={`Quota VPN pour ${userEmail}`}
          >
            <optgroup label="Promo · parrainage · récompense">
              {VPN_QUOTA_GRANT_OPTIONS.filter((option) => option.durationMs !== null).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Quota VPN">
              {VPN_QUOTA_GRANT_OPTIONS.filter((option) => option.durationMs === null).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </optgroup>
            {/* Seule façon de RETIRER une surcharge de routeur : sans elle, un
                routeur doté une fois ne pouvait plus revenir au quota du compte. */}
            {cible && (
              <optgroup label="Retirer la surcharge">
                <option value={ROUTER_QUOTA_INHERIT}>Suivre l&apos;organisation</option>
              </optgroup>
            )}
        </select>

        {/* Ordre de lecture = ordre du geste : on choisit CE qu'on donne, puis
            À QUI (tout le compte ou une zone), puis on applique. */}
        <div className="flex items-center gap-2">
          {routers.length > 0 && (
            <select
              name="routerId"
              value={routerId}
              onChange={(event) => setRouterId(event.target.value)}
              disabled={pending}
              className="h-9 min-w-0 flex-1 rounded-md border border-line bg-paper px-2 text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:opacity-60"
              aria-label={`Portée du quota VPN pour ${userEmail}`}
            >
              <option value="">Toute l&apos;organisation ({routers.length} routeurs)</option>
              {routers.map((router) => (
                <option key={router.id} value={router.id}>
                  {router.name}
                </option>
              ))}
            </select>
          )}
          <button
            type="submit"
            disabled={pending}
            className="flex h-9 items-center gap-1.5 rounded-md bg-ink px-3 text-xs font-semibold text-white hover:bg-slate-deep-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending && <Loader2 className="h-3 w-3 animate-spin" />}
            {pending ? "Application..." : "Appliquer"}
          </button>
        </div>
      </form>

      {/* Dire à QUI l'on donne, et ce que cette cible a déjà : appliquer un
          quota sans voir la portée choisie est la façon d'offrir tout un parc. */}
      <p className="text-[11px] text-ink-soft">
        {cible
          ? `Routeur « ${cible.name} » — actuellement : ${cible.quotaLabel}.`
          : "S'applique à tous les routeurs du compte."}
      </p>
      <p className="text-[11px] text-ink-soft">
        Les passes promotionnels sont gratuits et ne débitent jamais Safecoin.
      </p>

      <div role="status" aria-live="polite" className="min-h-[1.1rem] text-xs">
        {pending && (
          <span className="text-ink-soft">Mise à jour en cours...</span>
        )}
        {!pending && state?.success && (
          <span className="flex items-center gap-1 text-ok">
            <Check className="h-3.5 w-3.5" />
            Quota mis à jour.
          </span>
        )}
        {!pending && state && !state.success && (
          <span className="flex items-center gap-1 text-err">
            <X className="h-3.5 w-3.5" />
            {state.error}
          </span>
        )}
      </div>
    </div>
  );
}
