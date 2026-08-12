"use client";

import { useActionState, useMemo, useState } from "react";
import { Eye, Layers3, MapPin, Plus, Ticket, UserPlus, Wifi } from "lucide-react";
import {
  createRoamingGroup,
  createRoamingProfile,
  createRoamingUser,
  generateRoamingVouchers,
  revealRoamingUserPassword,
  saveRoamingOffer,
} from "@/lib/roaming/actions";

type Group = {
  id: string;
  name: string;
  code: string;
  active: boolean;
  routers: { id: string; name: string; status: string }[];
};
type NamedUser = {
  id: string;
  username: string;
  profileName: string | null;
  groupName: string | null;
  note: string | null;
  createdAt: string;
};
type Profile = {
  id: string;
  name: string;
  durationValue: number;
  durationUnit: string;
  uploadMbps: number;
  downloadMbps: number;
  defaultPriceCents: number;
  active: boolean;
};
type Offer = {
  id: string;
  groupId: string;
  groupName: string;
  groupCode: string;
  groupActive: boolean;
  profileId: string;
  profileName: string;
  defaultPriceCents: number;
  priceOverrideCents: number | null;
  effectivePriceCents: number;
  active: boolean;
  profileActive: boolean;
};
type Router = { id: string; name: string; status: string };
type ActionState = { error?: string; success?: boolean; created?: number; name?: string } | undefined;

function money(value: number) {
  return `${value.toLocaleString("fr-FR")} F`;
}

function duration(value: number, unit: string) {
  // Un profil illimité n'a pas de nombre à afficher : « 0 illimité » serait
  // absurde, et c'est justement l'absence d'échéance qui le caractérise.
  if (unit === "Unlimited") return "Illimité — sans expiration";
  const label = { Minutes: "min", Hours: "h", Days: "jour(s)", Weeks: "sem.", Months: "mois" }[unit] ?? unit;
  return `${value} ${label}`;
}

function Notice({ state }: { state: ActionState }) {
  if (!state) return null;
  return (
    <p className={`mt-3 rounded-md px-3 py-2 text-sm ${state.error ? "bg-red-50 text-red-700" : "bg-clay text-ok"}`} aria-live="polite">
      {state.error ?? "Enregistré."}
    </p>
  );
}

const inputClass = "mt-1 w-full rounded-md border border-line-soft bg-paper px-3 py-2 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20";
const labelClass = "block text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft";

export default function RoamingConsole({
  groups,
  profiles,
  offers,
  namedUsers,
  routers,
}: {
  groups: Group[];
  profiles: Profile[];
  offers: Offer[];
  namedUsers: NamedUser[];
  routers: Router[];
}) {
  const [groupState, groupAction, groupPending] = useActionState(createRoamingGroup, undefined);
  const [profileState, profileAction, profilePending] = useActionState(createRoamingProfile, undefined);
  // Unité du profil en cours de saisie : « Illimité » n'attend aucune durée.
  const [profileUnit, setProfileUnit] = useState("Hours");
  const [offerState, offerAction, offerPending] = useActionState(saveRoamingOffer, undefined);
  const [ticketState, ticketAction, ticketPending] = useActionState(generateRoamingVouchers, undefined);
  const [userState, userAction, userPending] = useActionState(createRoamingUser, undefined);
  // Mot de passe relu à la demande sur le routeur — jamais rendu dans la page
  // tant que personne ne l'a demandé.
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [selectedGroupId, setSelectedGroupId] = useState(groups[0]?.id ?? "");
  const selectableOffers = useMemo(
    () => offers.filter((offer) => offer.groupId === selectedGroupId && offer.active && offer.groupActive && offer.profileActive),
    [offers, selectedGroupId],
  );

  return (
    <div className="animate-fade-in-up pb-8">
      <section className="overflow-hidden border-2 border-line bg-ink text-paper">
        <div className="grid gap-6 p-6 lg:grid-cols-[1.4fr_0.9fr] lg:p-8">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-paper/20 bg-paper/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-brand">
              <Wifi className="h-3.5 w-3.5" /> Station roaming
            </div>
            <h1 className="mt-4 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">Un ticket. Plusieurs zones. Une grille nette.</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-paper/70">
              Créez une bibliothèque de profils, adaptez le prix à chaque zone, puis envoyez le même ticket vers tous les MikroTik du groupe.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-px self-end overflow-hidden border border-paper/15 bg-paper/15 text-center">
            <div className="bg-ink p-4"><p className="text-2xl font-bold text-brand">{groups.length}</p><p className="mt-1 text-[11px] uppercase tracking-wide text-paper/60">Groupes</p></div>
            <div className="bg-ink p-4"><p className="text-2xl font-bold text-brand">{profiles.length}</p><p className="mt-1 text-[11px] uppercase tracking-wide text-paper/60">Profils</p></div>
            <div className="bg-ink p-4"><p className="text-2xl font-bold text-brand">{offers.filter((offer) => offer.active).length}</p><p className="mt-1 text-[11px] uppercase tracking-wide text-paper/60">Offres</p></div>
          </div>
        </div>
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.04fr_0.96fr]">
        <section className="border-2 border-line bg-paper p-5">
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-xs font-semibold uppercase tracking-[0.15em] text-brand">01 — couverture</p><h2 className="mt-1 text-xl font-bold text-ink">Groupes & zones</h2></div>
            <MapPin className="h-5 w-5 text-ink-soft" />
          </div>
          <div className="mt-4 space-y-3">
            {groups.length === 0 && <p className="rounded-md bg-clay p-4 text-sm text-ink-soft">Commencez par relier au moins un MikroTik à un groupe.</p>}
            {groups.map((group) => (
              <article key={group.id} className="border border-line-soft p-4">
                <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold text-ink">{group.name}</h3><p className="font-mono text-xs text-ink-soft">{group.code}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${group.active ? "bg-brand text-ink" : "bg-clay text-ink-soft"}`}>{group.active ? "Actif" : "Pause"}</span></div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {group.routers.map((router) => <span key={router.id} className="inline-flex items-center gap-1.5 rounded-full border border-line-soft px-2.5 py-1 text-xs text-ink"><i className={`h-1.5 w-1.5 rounded-full ${router.status === "online" ? "bg-ok" : "bg-ink-soft"}`} />{router.name}</span>)}
                </div>
              </article>
            ))}
          </div>
          <form action={groupAction} className="mt-5 border-t border-line-soft pt-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink"><Plus className="h-4 w-4 text-brand" />Nouveau groupe</div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className={labelClass}>Nom<input name="name" required placeholder="CIV roaming" className={inputClass} /></label><label className={labelClass}>Code <span className="normal-case tracking-normal">(optionnel)</span><input name="code" placeholder="CIV-ROAMING" className={inputClass} /></label></div>
            <fieldset className="mt-3"><legend className={labelClass}>MikroTik couverts</legend><div className="mt-1 grid max-h-32 gap-1 overflow-y-auto rounded-md border border-line-soft p-2 sm:grid-cols-2">{routers.map((router) => <label key={router.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-ink hover:bg-clay"><input type="checkbox" name="routerIds" value={router.id} />{router.name}</label>)}{routers.length === 0 && <span className="px-2 py-1 text-sm text-ink-soft">Aucun routeur.</span>}</div></fieldset>
            <button disabled={groupPending || routers.length === 0} className="mt-3 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-paper hover:bg-brand disabled:opacity-60">{groupPending ? "Création…" : "Créer le groupe"}</button><Notice state={groupState} />
          </form>
        </section>

        <section className="border-2 border-line bg-paper p-5">
          <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.15em] text-brand">02 — catalogue</p><h2 className="mt-1 text-xl font-bold text-ink">Profils communs</h2></div><Layers3 className="h-5 w-5 text-ink-soft" /></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {profiles.map((profile) => <article key={profile.id} className="border border-line-soft p-4"><div className="flex justify-between gap-3"><div><h3 className="font-mono text-sm font-bold text-ink">{profile.name}</h3><p className="mt-1 text-xs text-ink-soft">{duration(profile.durationValue, profile.durationUnit)} · {profile.uploadMbps}M/{profile.downloadMbps}M</p></div><strong className="text-sm text-ink">{money(profile.defaultPriceCents)}</strong></div><p className="mt-3 text-xs text-ink-soft">Prix catalogue</p></article>)}
            {profiles.length === 0 && <p className="rounded-md bg-clay p-4 text-sm text-ink-soft sm:col-span-2">Ajoutez 05-HEURES, 01-JOUR, 01-MOIS ou vos propres durées.</p>}
          </div>
          <form action={profileAction} className="mt-5 border-t border-line-soft pt-5"><div className="flex items-center gap-2 text-sm font-semibold text-ink"><Plus className="h-4 w-4 text-brand" />Ajouter un profil</div><div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4"><label className={labelClass}>Durée<input name="durationValue" type="number" min="1" defaultValue="5" required={profileUnit !== "Unlimited"} disabled={profileUnit === "Unlimited"} className={`${inputClass} disabled:opacity-40`} /></label><label className={labelClass}>Unité<select name="durationUnit" value={profileUnit} onChange={(e) => setProfileUnit(e.target.value)} className={inputClass}><option value="Minutes">Minutes</option><option value="Hours">Heures</option><option value="Days">Jours</option><option value="Weeks">Semaines</option><option value="Months">Mois</option><option value="Unlimited">Illimité (admin / technicien)</option></select></label><label className={labelClass}>Montant<input name="uploadMbps" type="number" min="1" defaultValue="5" required className={inputClass} /></label><label className={labelClass}>Descendant<input name="downloadMbps" type="number" min="1" defaultValue="5" required className={inputClass} /></label></div><label className={`mt-3 ${labelClass}`}>Tarif catalogue (FCFA)<input name="defaultPriceCents" type="number" min="0" defaultValue="100" required className={inputClass} /></label>{profileUnit === "Unlimited" && <p className="mt-3 border-l-2 border-brand bg-clay/50 px-3 py-2 text-xs leading-5 text-ink-soft">Compte <strong className="text-ink">sans expiration</strong>, destiné aux administrateurs et techniciens de zone. Le profil est créé sur les MikroTik sans planificateur de suppression : rien ne coupera la session d’un technicien en intervention. Ces comptes n’apparaissent pas dans le journal de ventes MikHmon — ils ne sont pas vendus.</p>}<button disabled={profilePending} className="mt-3 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-paper hover:bg-brand disabled:opacity-60">{profilePending ? "Ajout…" : "Ajouter le profil"}</button><Notice state={profileState} /></form>
        </section>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[0.92fr_1.08fr]">
        <section className="border-2 border-line bg-paper p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.15em] text-brand">03 — tarification</p><h2 className="mt-1 text-xl font-bold text-ink">Prix par groupe</h2></div><span className="rounded-full bg-clay px-2.5 py-1 text-xs text-ink-soft">hérité ou local</span></div><div className="mt-4 divide-y divide-line-soft border-y border-line-soft">{offers.map((offer) => <div key={offer.id} className="flex items-center justify-between gap-3 py-3"><div><p className="font-medium text-ink">{offer.groupName} <span className="font-mono text-xs text-ink-soft">/ {offer.profileName}</span></p><p className="mt-0.5 text-xs text-ink-soft">{offer.priceOverrideCents === null ? "Prix catalogue" : "Prix spécifique au groupe"}</p></div><strong className="text-sm text-ink">{money(offer.effectivePriceCents)}</strong></div>)}{offers.length === 0 && <p className="py-4 text-sm text-ink-soft">Aucune offre activée pour l’instant.</p>}</div><form action={offerAction} className="mt-5"><div className="grid gap-3 sm:grid-cols-2"><label className={labelClass}>Groupe<select name="groupId" required className={inputClass}><option value="">Choisir…</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label><label className={labelClass}>Profil<select name="profileId" required className={inputClass}><option value="">Choisir…</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name} — {money(profile.defaultPriceCents)}</option>)}</select></label></div><label className={`mt-3 ${labelClass}`}>Tarif du groupe <span className="normal-case tracking-normal">(laisser vide = catalogue)</span><input name="priceOverrideCents" inputMode="numeric" placeholder="Ex : 300" className={inputClass} /></label><button disabled={offerPending || groups.length === 0 || profiles.length === 0} className="mt-3 rounded-md border border-line bg-paper px-4 py-2 text-sm font-semibold text-ink hover:bg-clay disabled:opacity-60">{offerPending ? "Enregistrement…" : "Activer l’offre"}</button><Notice state={offerState} /></form></section>

        <section className="border-2 border-brand bg-paper p-5 shadow-[6px_6px_0_var(--color-brand)]"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.15em] text-brand">04 — émission</p><h2 className="mt-1 text-xl font-bold text-ink">Créer des tickets roaming</h2><p className="mt-1 text-sm text-ink-soft">Le code et le mot de passe sont posés à l’identique dans chaque zone du groupe.</p></div><Ticket className="h-6 w-6 text-brand" /></div><form action={ticketAction} className="mt-5"><label className={labelClass}>Groupe<select value={selectedGroupId} onChange={(event) => setSelectedGroupId(event.target.value)} className={inputClass}><option value="">Choisir…</option>{groups.filter((group) => group.active).map((group) => <option key={group.id} value={group.id}>{group.name} · {group.routers.length} zone(s)</option>)}</select></label><input type="hidden" name="groupId" value={selectedGroupId} /><label className={`mt-3 ${labelClass}`}>Offre<select name="offerId" required disabled={!selectedGroupId || selectableOffers.length === 0} className={inputClass}><option value="">{selectableOffers.length ? "Choisir un profil…" : "Aucune offre active"}</option>{selectableOffers.map((offer) => <option key={offer.id} value={offer.id}>{offer.profileName} — {money(offer.effectivePriceCents)}{offer.priceOverrideCents !== null ? " · tarif local" : ""}</option>)}</select></label><div className="mt-3 grid gap-3 sm:grid-cols-3"><label className={labelClass}>Quantité<input name="quantity" type="number" min="1" max="200" defaultValue="10" required className={inputClass} /></label><label className={labelClass}>Préfixe<input name="prefix" maxLength={10} placeholder="ex : nord" className={inputClass} /></label><label className={labelClass}>Note<input name="note" maxLength={180} placeholder="lot juillet" className={inputClass} /></label></div><button disabled={ticketPending || selectableOffers.length === 0} className="mt-4 rounded-md bg-brand px-5 py-2.5 text-sm font-bold text-ink hover:bg-brand/85 disabled:opacity-60">{ticketPending ? "Provisionnement…" : "Créer les tickets"}</button><Notice state={ticketState} /></form></section>

        <section className="border-2 border-line bg-paper p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.15em] text-brand">05 — comptes nominatifs</p><h2 className="mt-1 text-xl font-bold text-ink">Créer un utilisateur</h2><p className="mt-1 text-sm text-ink-soft">Un identifiant et un mot de passe choisis, au lieu d’un code tiré au hasard — pour les administrateurs et techniciens de zone. Associé à une offre illimitée, le compte n’expire pas.</p></div><UserPlus className="h-6 w-6 text-brand" /></div>

          <form action={userAction} className="mt-5 border-t border-line-soft pt-5"><input type="hidden" name="groupId" value={selectedGroupId} /><p className="text-xs text-ink-soft">Groupe : <strong className="text-ink">{groups.find((group) => group.id === selectedGroupId)?.name ?? "à choisir en 04 — émission"}</strong> · le compte est posé sur <strong className="text-ink">toutes</strong> ses zones.</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className={labelClass}>Identifiant<input name="username" required maxLength={32} pattern="[A-Za-z0-9._\-]{2,32}" placeholder="ex : aroune" autoComplete="off" className={`${inputClass} font-mono`} /></label><label className={labelClass}>Mot de passe <span className="normal-case tracking-normal">(vide = identique)</span><input name="password" maxLength={64} placeholder="ex : aroune" autoComplete="off" className={`${inputClass} font-mono`} /></label></div><label className={`mt-3 ${labelClass}`}>Offre<select name="offerId" required disabled={!selectedGroupId || selectableOffers.length === 0} className={inputClass}><option value="">{selectableOffers.length ? "Choisir un profil…" : "Aucune offre active"}</option>{selectableOffers.map((offer) => <option key={offer.id} value={offer.id}>{offer.profileName} — {money(offer.effectivePriceCents)}</option>)}</select></label><label className={`mt-3 ${labelClass}`}>Rôle ou note<input name="note" maxLength={180} placeholder="ex : technicien zone nord" className={inputClass} /></label><button disabled={userPending || !selectedGroupId || selectableOffers.length === 0} className="mt-4 rounded-md bg-ink px-5 py-2.5 text-sm font-bold text-paper hover:bg-brand disabled:opacity-60">{userPending ? "Création…" : "Créer l’utilisateur"}</button><Notice state={userState} /></form>

          {namedUsers.length > 0 && <div className="mt-5 border-t border-line-soft pt-4"><p className={labelClass}>Comptes existants</p><ul className="mt-2 divide-y divide-line-soft border-y border-line-soft">{namedUsers.map((user) => <li key={user.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5"><div><p className="font-mono text-sm font-bold text-ink">{user.username}</p><p className="mt-0.5 text-xs text-ink-soft">{[user.groupName, user.profileName, user.note].filter(Boolean).join(" · ") || "—"}</p></div>{revealed[user.id] ? <code className="rounded bg-clay px-2 py-1 font-mono text-xs text-ink">{revealed[user.id]}</code> : <button type="button" onClick={async () => { const res = await revealRoamingUserPassword(user.id); const shown = ("password" in res ? res.password : res.error) ?? "indisponible"; setRevealed((prev) => ({ ...prev, [user.id]: shown })); }} className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs font-semibold text-ink-soft hover:bg-clay"><Eye className="h-3.5 w-3.5" />Mot de passe</button>}</li>)}</ul><p className="mt-2 text-xs leading-5 text-ink-soft">Le SaaS ne conserve pas ces mots de passe : ils sont relus sur le MikroTik, qui en est la source de vérité.</p></div>}
        </section>
      </div>

      <p className="mt-6 border-l-2 border-brand pl-3 text-xs leading-5 text-ink-soft">La première connexion fige la date d’expiration ; la station la réconcilie ensuite sur tous les routeurs du ticket. Le compteur centralisé temps réel sera ajouté avec le relais RADIUS dédié.</p>
    </div>
  );
}
