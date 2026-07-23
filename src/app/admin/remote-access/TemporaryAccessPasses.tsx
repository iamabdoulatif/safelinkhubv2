"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Check, Gift, TimerReset } from "lucide-react";
import { createTemporaryAccessGrant, revokeTemporaryAccessGrant } from "@/lib/remote-access/grant-actions";
import { REMOTE_ACCESS_SERVICES } from "@/lib/billing/remote-access-gate-config";
import { TEMPORARY_ACCESS_DURATIONS } from "@/lib/remote-access/grant-durations";

export type Grant = {
  id: string;
  orgId: string;
  orgName: string;
  orgSlug: string;
  routerId: string | null;
  routerName: string | null;
  services: string[];
  durationKey: string;
  startsAt: Date;
  expiresAt: Date;
  status: string;
  reason: string;
  note: string | null;
  createdAt: Date;
  revokedAt: Date | null;
  revokeReason: string | null;
};

export type Organization = { id: string; name: string; slug: string };
export type GrantRouter = { id: string; name: string; orgId: string };

const reasonLabels: Record<string, string> = {
  promo: "Promotion",
  referral: "Parrainage",
  reward: "Récompense",
  support: "Support",
  operations: "Intervention technique",
  other: "Autre",
};

function dateTime(value: Date) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function servicesLabel(services: string[]) {
  return services.length === 0 ? "Tous les services" : services.map((service) => REMOTE_ACCESS_SERVICES.find((item) => item.id === service)?.label ?? service).join(" · ");
}

export default function TemporaryAccessPasses({
  organizations,
  routers,
  grants,
  embedded = false,
}: {
  organizations: Organization[];
  routers: GrantRouter[];
  grants: Grant[];
  embedded?: boolean;
}) {
  const [state, action, pending] = useActionState(createTemporaryAccessGrant, undefined);
  const [selectedOrg, setSelectedOrg] = useState(organizations[0]?.id ?? "");
  const [selectedServices, setSelectedServices] = useState<string[]>([]);

  function toggleService(service: string) {
    setSelectedServices((current) => current.includes(service) ? current.filter((item) => item !== service) : [...current, service]);
  }

  return (
    <section className={embedded ? "bg-transparent p-1 sm:p-2" : "border-2 border-line bg-paper p-5 shadow-[4px_4px_0_var(--line)] sm:p-6"}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3"><div className="rounded-full bg-brand/20 p-2.5"><Gift className="h-5 w-5 text-brand-deep" aria-hidden="true" /></div><div><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-deep">Superadmin · gratuit</p><h2 className="mt-1 text-lg font-semibold text-ink">Passes d&apos;accès temporaire</h2><p className="mt-1 max-w-2xl text-sm text-ink-soft">Pour une promo, un parrainage, une récompense ou une intervention MikroTik. Aucun prix fixe, aucun débit Safecoin.</p></div></div>
        <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-ok">Réutilisable pendant la fenêtre</span>
      </div>

      {state && "error" in state && <p className="mt-4 bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state && "success" in state && <p className="mt-4 flex items-center gap-2 bg-green-50 px-3 py-2 text-sm text-green-800"><Check className="h-4 w-4" aria-hidden="true" /> Pass attribué et activé.</p>}

      <form action={action} className="mt-5 grid gap-4 border border-line-soft bg-clay/40 p-4 lg:grid-cols-2">
        <label className="text-sm font-medium text-ink">Organisation bénéficiaire<select name="orgId" value={selectedOrg} onChange={(event) => setSelectedOrg(event.target.value)} required className="mt-1.5 w-full border border-line-soft bg-paper px-3 py-2.5 text-sm">{organizations.map((org) => <option key={org.id} value={org.id}>{org.name} · {org.slug}</option>)}</select></label>
        <label className="text-sm font-medium text-ink">Routeur ciblé <select name="routerId" className="mt-1.5 w-full border border-line-soft bg-paper px-3 py-2.5 text-sm"><option value="">Tous les routeurs de l&apos;organisation</option>{routers.filter((router) => router.orgId === selectedOrg).map((router) => <option key={router.id} value={router.id}>{router.name}</option>)}</select></label>
        <fieldset className="lg:col-span-2"><legend className="text-sm font-medium text-ink">Durée gratuite</legend><div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">{Object.entries(TEMPORARY_ACCESS_DURATIONS).map(([key, duration]) => <label key={key} className="cursor-pointer"><input type="radio" name="durationKey" value={key} defaultChecked={key === "hour_1"} className="peer sr-only" /><span className="flex items-center justify-center border-2 border-line-soft bg-paper px-3 py-2.5 text-sm font-semibold text-ink peer-checked:border-brand-deep peer-checked:bg-brand/20">{duration.label}</span></label>)}</div></fieldset>
        <fieldset className="lg:col-span-2"><legend className="text-sm font-medium text-ink">Services autorisés <span className="font-normal text-ink-soft">(aucune sélection = tous)</span></legend><div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{REMOTE_ACCESS_SERVICES.map((service) => <label key={service.id} className="flex cursor-pointer items-center gap-2 border border-line-soft bg-paper px-3 py-2 text-sm"><input type="checkbox" name="services" value={service.id} checked={selectedServices.includes(service.id)} onChange={() => toggleService(service.id)} />{service.label}</label>)}</div></fieldset>
        <label className="text-sm font-medium text-ink">Motif<select name="reason" defaultValue="promo" className="mt-1.5 w-full border border-line-soft bg-paper px-3 py-2.5 text-sm">{Object.entries(reasonLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="text-sm font-medium text-ink">Note obligatoire<textarea name="note" required rows={2} placeholder="Ex : Parrainage de la campagne juillet" className="mt-1.5 w-full resize-none border border-line-soft bg-paper px-3 py-2.5 text-sm" /></label>
        <button type="submit" disabled={pending || !selectedOrg} className="inline-flex items-center justify-center gap-2 bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 lg:col-span-2"><TimerReset className="h-4 w-4" aria-hidden="true" />{pending ? "Attribution…" : "Attribuer le pass gratuit"}</button>
      </form>

      <div className="mt-6"><div className="flex items-center justify-between gap-3"><h3 className="font-semibold text-ink">Passes récents</h3><span className="text-xs text-ink-soft">{grants.length} enregistrement{grants.length > 1 ? "s" : ""}</span></div><div className="mt-3 space-y-2">{grants.length === 0 ? <p className="border border-dashed border-line-soft px-3 py-6 text-center text-sm text-ink-soft">Aucun pass attribué.</p> : grants.slice(0, 15).map((grant) => <GrantRow key={grant.id} grant={grant} />)}</div></div>
    </section>
  );
}

function GrantRow({ grant }: { grant: Grant }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const active = grant.status === "active" || grant.status === "scheduled";
  const revoked = grant.status === "revoked";
  async function revoke() {
    if (!reason.trim()) return;
    setPending(true);
    const result = await revokeTemporaryAccessGrant(grant.id, reason);
    if ("success" in result) router.refresh();
    setPending(false);
  }
  return <div className="border border-line-soft px-3 py-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${active ? "bg-green-50 text-ok" : revoked ? "bg-red-50 text-red-700" : "bg-clay text-ink-soft"}`}>{active ? "Actif" : revoked ? "Révoqué" : "Expiré"}</span><span className="font-semibold text-ink">{grant.orgName}</span><span className="text-xs text-ink-soft">{reasonLabels[grant.reason] ?? grant.reason}</span></div><p className="mt-1 text-xs text-ink-soft">{grant.routerName ?? "Tous les routeurs"} · {servicesLabel(grant.services)} · expire le {dateTime(grant.expiresAt)}</p>{grant.note && <p className="mt-1 text-xs text-ink-soft">{grant.note}</p>}</div>{active && <div className="flex items-center gap-2"><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Motif de révocation" aria-label={`Motif de révocation pour ${grant.orgName}`} className="w-40 border border-line-soft px-2 py-1.5 text-xs" /><button type="button" disabled={pending || !reason.trim()} onClick={revoke} className="inline-flex items-center gap-1.5 border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-700 disabled:opacity-50"><Ban className="h-3.5 w-3.5" aria-hidden="true" /> Révoquer</button></div>}</div></div>;
}
