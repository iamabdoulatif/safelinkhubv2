"use client";

import { useActionState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { updateOrganizationVpnQuota } from "@/lib/billing/actions";
import { VPN_QUOTA_GRANT_OPTIONS } from "@/lib/billing/vpn-quota";

export default function VpnQuotaForm({ userId, userEmail }: { userId: string; userEmail: string }) {
  const [state, formAction, pending] = useActionState(updateOrganizationVpnQuota, null);

  return (
    <div className="flex flex-col gap-1.5">
      <form action={formAction} className="flex items-center gap-2">
        <input type="hidden" name="userId" value={userId} />
        <select
          name="grant"
          disabled={pending}
          className="h-9 rounded-md border-2 border-line bg-paper px-2 text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:opacity-60"
          aria-label={`Quota VPN pour ${userEmail}`}
        >
          {VPN_QUOTA_GRANT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="flex h-9 items-center gap-1.5 rounded-md bg-ink px-3 text-xs font-semibold text-white hover:bg-[#3A362F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending && <Loader2 className="h-3 w-3 animate-spin" />}
          {pending ? "Application..." : "Appliquer"}
        </button>
      </form>

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
          <span className="flex items-center gap-1 text-red-600">
            <X className="h-3.5 w-3.5" />
            {state.error}
          </span>
        )}
      </div>
    </div>
  );
}
