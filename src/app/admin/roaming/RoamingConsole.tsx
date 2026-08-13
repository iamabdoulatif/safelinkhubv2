"use client";

import { useActionState, useMemo, useState } from "react";
import { Eye, Layers3, MapPin, Pause, Pencil, Play, Plus, Ticket, Trash2, UserPlus, Wifi, X } from "lucide-react";
import {
  addRoamingGroupRouters,
  createRoamingGroup,
  createRoamingProfile,
  createRoamingUser,
  deleteRoamingGroup,
  deleteRoamingOffer,
  deleteRoamingUser,
  generateRoamingVouchers,
  revealRoamingUserPassword,
  saveRoamingOffer,
  setRoamingGroupActive,
  setRoamingOfferActive,
  updateRoamingUser,
} from "@/lib/roaming/actions";
import { ROAMING_USERNAME_PATTERN } from "@/lib/roaming/forms";

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
  groupId: string | null;
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
type ActionState =
  | {
      error?: string;
      success?: boolean;
      created?: number;
      name?: string;
      username?: string;
      updatedOn?: number;
      removedOn?: number;
      added?: number;
      synchronizedAccounts?: number;
      skipped?: string[];
    }
  | undefined;
type View = "operations" | "groups" | "catalogue" | "accounts";
type Drawer = "tickets" | "zone" | "group" | "profile" | "offer" | "account" | null;

function money(value: number) {
  return `${value.toLocaleString("fr-FR")} F`;
}

function duration(value: number, unit: string) {
  if (unit === "Unlimited") return "Illimité — sans expiration";
  const label = { Minutes: "min", Hours: "h", Days: "jour(s)", Weeks: "sem.", Months: "mois" }[unit] ?? unit;
  return `${value} ${label}`;
}

function Notice({ state }: { state: ActionState }) {
  if (!state) return null;

  return (
    <p
      className={`mt-3 rounded-md px-3 py-2 text-sm ${state.error ? "bg-red-50 text-red-700" : "bg-clay text-ok"}`}
      aria-live="polite"
    >
      {state.error ?? "Enregistré."}
    </p>
  );
}

function StatusDot({ status }: { status: string }) {
  const online = status === "online";
  return (
    <span className="inline-flex items-center gap-1.5">
      <i className={`h-2 w-2 rounded-full ${online ? "bg-ok" : "bg-warn"}`} />
      <span>{online ? "En ligne" : "À vérifier"}</span>
    </span>
  );
}

const inputClass =
  "mt-1 w-full rounded-md border border-line-soft bg-paper px-3 py-2 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20";
const labelClass = "block text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft";
const panelClass = "border-2 border-line bg-paper p-5 sm:p-6";

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
  const [groupZoneState, groupZoneAction, groupZonePending] = useActionState(addRoamingGroupRouters, undefined);
  const [profileState, profileAction, profilePending] = useActionState(createRoamingProfile, undefined);
  const [offerState, offerAction, offerPending] = useActionState(saveRoamingOffer, undefined);
  const [offerToggleState, offerToggleAction, offerTogglePending] = useActionState(setRoamingOfferActive, undefined);
  const [groupToggleState, groupToggleAction, groupTogglePending] = useActionState(setRoamingGroupActive, undefined);
  const [offerDropState, offerDropAction, offerDropPending] = useActionState(deleteRoamingOffer, undefined);
  const [groupDropState, groupDropAction, groupDropPending] = useActionState(deleteRoamingGroup, undefined);
  const [ticketState, ticketAction, ticketPending] = useActionState(generateRoamingVouchers, undefined);
  const [userState, userAction, userPending] = useActionState(createRoamingUser, undefined);
  const [editState, editAction, editPending] = useActionState(updateRoamingUser, undefined);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteRoamingUser, undefined);

  const firstActiveGroupId = groups.find((group) => group.active)?.id ?? "";
  const [activeView, setActiveView] = useState<View>("operations");
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [selectedGroupId, setSelectedGroupId] = useState(firstActiveGroupId);
  const [userGroupId, setUserGroupId] = useState(firstActiveGroupId);
  const [addingZoneToGroupId, setAddingZoneToGroupId] = useState<string | null>(null);
  const [profileUnit, setProfileUnit] = useState("Hours");
  const [confirmingOfferId, setConfirmingOfferId] = useState<string | null>(null);
  const [confirmingGroupId, setConfirmingGroupId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [accountSearch, setAccountSearch] = useState("");

  const groupsWithHealth = useMemo(
    () =>
      groups.map((group) => ({
        ...group,
        onlineRouters: group.routers.filter((router) => router.status === "online"),
        offlineRouters: group.routers.filter((router) => router.status !== "online"),
      })),
    [groups],
  );
  const selectedGroup = groupsWithHealth.find((group) => group.id === selectedGroupId) ?? groupsWithHealth[0] ?? null;
  const groupForZone = groupsWithHealth.find((group) => group.id === addingZoneToGroupId) ?? selectedGroup;
  const selectableOffers = useMemo(
    () => offers.filter((offer) => offer.groupId === selectedGroupId && offer.active && offer.groupActive && offer.profileActive),
    [offers, selectedGroupId],
  );
  const userCreationOffers = useMemo(
    () => offers.filter((offer) => offer.groupId === userGroupId && offer.active && offer.groupActive && offer.profileActive),
    [offers, userGroupId],
  );
  const selectedOffers = offers.filter((offer) => offer.groupId === selectedGroupId);
  const selectedNamedUsers = namedUsers.filter((user) => user.groupId === selectedGroup?.id);
  const visibleNamedUsers = namedUsers.filter((user) => {
    const query = accountSearch.trim().toLocaleLowerCase("fr-FR");
    if (!query) return true;
    return [user.username, user.groupName, user.profileName, user.note].some((value) => value?.toLocaleLowerCase("fr-FR").includes(query));
  });
  const onlineZoneCount = groupsWithHealth.reduce((total, group) => total + group.onlineRouters.length, 0);
  const offlineZoneCount = groupsWithHealth.reduce((total, group) => total + group.offlineRouters.length, 0);

  function selectGroup(groupId: string, view: View = "operations") {
    setSelectedGroupId(groupId);
    setActiveView(view);
    setDrawer(null);
  }

  function openDrawer(nextDrawer: Exclude<Drawer, null>, groupId?: string) {
    if (groupId) setSelectedGroupId(groupId);
    if (nextDrawer === "zone") setAddingZoneToGroupId(groupId ?? selectedGroupId);
    setDrawer(nextDrawer);
  }

  const navItems: { id: View; label: string; count?: number }[] = [
    { id: "operations", label: "Exploitation" },
    { id: "groups", label: "Groupes", count: groups.length },
    { id: "catalogue", label: "Catalogue", count: profiles.length + offers.length },
    { id: "accounts", label: "Comptes", count: namedUsers.length },
  ];

  return (
    <div className="animate-fade-in-up pb-10">
      <section className="overflow-hidden border-2 border-line bg-ink text-paper">
        <div className="grid gap-7 p-6 lg:grid-cols-[1.25fr_0.75fr] lg:p-8">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-paper/20 bg-paper/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-brand">
              <Wifi className="h-3.5 w-3.5" /> Station roaming
            </div>
            <h1 className="mt-4 max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl">Pilotez la couverture avant d’émettre.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-paper/70">
              Une même offre peut couvrir plusieurs zones. Vérifiez d’abord le terrain, puis créez les accès dans le groupe choisi.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-px self-end overflow-hidden border border-paper/15 bg-paper/15 text-center">
            <div className="bg-ink p-4"><p className="text-2xl font-bold text-brand">{groups.length}</p><p className="mt-1 text-[11px] uppercase tracking-wide text-paper/60">Groupes</p></div>
            <div className="bg-ink p-4"><p className="text-2xl font-bold text-brand">{onlineZoneCount}</p><p className="mt-1 text-[11px] uppercase tracking-wide text-paper/60">Zones en ligne</p></div>
            <div className="bg-ink p-4"><p className="text-2xl font-bold text-brand">{namedUsers.length}</p><p className="mt-1 text-[11px] uppercase tracking-wide text-paper/60">Comptes</p></div>
          </div>
        </div>
      </section>

      <nav aria-label="Navigation de la station roaming" className="mt-5 flex gap-1 overflow-x-auto border-b-2 border-line pb-px">
        {navItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveView(item.id)}
            aria-current={activeView === item.id ? "page" : undefined}
            className={`flex shrink-0 items-center gap-2 border-x border-t px-4 py-3 text-sm font-semibold transition-colors ${
              activeView === item.id ? "border-line bg-paper text-ink" : "border-transparent text-ink-soft hover:bg-clay hover:text-ink"
            }`}
          >
            <span>{item.label}</span>
            {item.count !== undefined && <span className="rounded-full bg-clay px-2 py-0.5 text-[11px] text-ink-soft">{item.count}</span>}
          </button>
        ))}
      </nav>

      {activeView === "operations" && (
        <section className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          <div className={`${panelClass} min-h-[420px]`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-brand">Vue terrain</p>
                <h2 className="mt-1 text-2xl font-bold text-ink">Exploitation</h2>
                <p className="mt-1 text-sm text-ink-soft">Choisissez une couverture pour concentrer les décisions au même endroit.</p>
              </div>
              <button type="button" onClick={() => openDrawer("tickets")} disabled={!selectedGroup?.active || selectableOffers.length === 0} className="inline-flex items-center gap-2 rounded-md bg-brand px-4 py-2.5 text-sm font-bold text-ink shadow-[3px_3px_0_var(--color-ink)] hover:bg-brand/85 disabled:cursor-not-allowed disabled:opacity-50">
                <Ticket className="h-4 w-4" /> Créer des accès
              </button>
            </div>

            <label className={`mt-6 max-w-md ${labelClass}`}>
              Groupe actif
              <select value={selectedGroup?.id ?? ""} onChange={(event) => setSelectedGroupId(event.target.value)} className={inputClass}>
                {groupsWithHealth.length === 0 && <option value="">Aucun groupe disponible</option>}
                {groupsWithHealth.map((group) => <option key={group.id} value={group.id}>{group.name} · {group.onlineRouters.length}/{group.routers.length} zone(s) en ligne</option>)}
              </select>
            </label>

            {selectedGroup ? (
              <div className="mt-5">
                <div className="flex flex-wrap items-center justify-between gap-3 border-y border-line-soft py-4">
                  <div>
                    <p className="font-mono text-xs text-ink-soft">{selectedGroup.code}</p>
                    <h3 className="mt-1 text-xl font-bold text-ink">{selectedGroup.name}</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${selectedGroup.active ? "bg-brand text-ink" : "bg-clay text-ink-soft"}`}>{selectedGroup.active ? "Émission active" : "Émission en pause"}</span>
                    <button type="button" onClick={() => openDrawer("zone", selectedGroup.id)} className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:bg-clay"><Plus className="h-3.5 w-3.5" /> Zone</button>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <article className="border border-line-soft p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">Zones en ligne</p><p className="mt-2 text-3xl font-bold text-ok">{selectedGroup.onlineRouters.length}<span className="ml-1 text-base text-ink-soft">/ {selectedGroup.routers.length}</span></p><p className="mt-2 text-xs text-ink-soft">Le dernier état connu du parc sélectionné.</p></article>
                  <article className="border border-line-soft p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">Comptes nominatifs</p><p className="mt-2 text-3xl font-bold text-ink">{selectedNamedUsers.length}</p><p className="mt-2 text-xs text-ink-soft">Administrateurs et techniciens de ce groupe.</p></article>
                </div>

                <div className="mt-5">
                  <div className="flex items-center justify-between gap-3"><h3 className="font-semibold text-ink">Couverture du groupe</h3><span className="text-xs text-ink-soft">{selectedGroup.routers.length} zone(s)</span></div>
                  <ul className="mt-2 divide-y divide-line-soft border-y border-line-soft">
                    {selectedGroup.routers.map((router) => <li key={router.id} className="flex items-center justify-between gap-3 py-3"><span className="font-medium text-ink">{router.name}</span><span className="text-xs text-ink-soft"><StatusDot status={router.status} /></span></li>)}
                    {selectedGroup.routers.length === 0 && <li className="py-4 text-sm text-ink-soft">Aucune zone dans ce groupe.</li>}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="mt-8 border border-dashed border-line-soft bg-clay/40 p-6 text-sm text-ink-soft">Créez un premier groupe et rattachez-lui les MikroTik concernés.</div>
            )}
          </div>

          <aside className="space-y-5">
            <section className={`${panelClass} border-brand`}>
              <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.15em] text-brand">À vérifier</p><h2 className="mt-1 text-xl font-bold text-ink">Alertes de couverture</h2></div><MapPin className="h-5 w-5 text-brand" /></div>
              <p className="mt-4 text-4xl font-bold text-ink">{offlineZoneCount}</p>
              <p className="mt-1 text-sm text-ink-soft">zones non joignables dans les groupes configurés.</p>
              {offlineZoneCount > 0 && <ul className="mt-4 space-y-2 border-t border-line-soft pt-3">{groupsWithHealth.flatMap((group) => group.offlineRouters.map((router) => <li key={router.id} className="flex items-center justify-between gap-3 text-sm"><span className="text-ink">{router.name}</span><span className="text-xs text-ink-soft">{group.name}</span></li>))}</ul>}
            </section>

            <section className={panelClass}>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-brand">Repères</p>
              <div className="mt-3 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-4"><span className="text-ink-soft">Offres prêtes à émettre</span><strong className="text-ink">{selectableOffers.length}</strong></div>
                <div className="flex items-center justify-between gap-4"><span className="text-ink-soft">Profils communs</span><strong className="text-ink">{profiles.length}</strong></div>
                <div className="flex items-center justify-between gap-4"><span className="text-ink-soft">Groupe sélectionné</span><strong className="max-w-[11rem] truncate text-ink">{selectedGroup?.name ?? "—"}</strong></div>
              </div>
              <button type="button" onClick={() => setActiveView("catalogue")} className="mt-5 w-full rounded-md border border-line px-3 py-2 text-sm font-semibold text-ink hover:bg-clay">Gérer le catalogue</button>
            </section>
          </aside>
        </section>
      )}

      {activeView === "groups" && (
        <section className={`mt-5 ${panelClass}`}>
          <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.15em] text-brand">Structure du parc</p><h2 className="mt-1 text-2xl font-bold text-ink">Groupes & zones</h2><p className="mt-1 text-sm text-ink-soft">Comparez les couvertures puis intervenez sur le bon groupe.</p></div><button type="button" onClick={() => openDrawer("group")} className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2.5 text-sm font-bold text-paper hover:bg-brand"><Plus className="h-4 w-4" /> Nouveau groupe</button></div>
          <div className="mt-6 overflow-x-auto border border-line-soft">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-clay/60 text-xs uppercase tracking-[0.12em] text-ink-soft"><tr><th className="px-4 py-3 font-semibold">Groupe</th><th className="px-4 py-3 font-semibold">Couverture</th><th className="px-4 py-3 font-semibold">Émission</th><th className="px-4 py-3 font-semibold text-right">Actions</th></tr></thead>
              <tbody className="divide-y divide-line-soft">
                {groupsWithHealth.map((group) => (
                  <tr key={group.id} className={group.id === selectedGroup?.id ? "bg-brand/10" : "bg-paper"}>
                    <td className="px-4 py-4"><button type="button" onClick={() => selectGroup(group.id)} className="text-left hover:underline"><span className="block font-semibold text-ink">{group.name}</span><span className="font-mono text-xs text-ink-soft">{group.code}</span></button></td>
                    <td className="px-4 py-4"><span className="font-semibold text-ok">{group.onlineRouters.length}</span><span className="text-ink-soft">/{group.routers.length} en ligne</span>{group.offlineRouters.length > 0 && <span className="ml-2 text-xs text-warn">· {group.offlineRouters.length} à vérifier</span>}</td>
                    <td className="px-4 py-4"><form action={groupToggleAction}><input type="hidden" name="groupId" value={group.id} /><input type="hidden" name="active" value={group.active ? "false" : "true"} /><button disabled={groupTogglePending} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold disabled:opacity-60 ${group.active ? "bg-brand text-ink" : "bg-clay text-ink-soft"}`}>{group.active ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}{group.active ? "Active" : "En pause"}</button></form></td>
                    <td className="px-4 py-4"><div className="flex justify-end gap-2"><button type="button" onClick={() => openDrawer("zone", group.id)} className="rounded-md border border-line px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-clay">Zones</button>{confirmingGroupId === group.id ? <form action={groupDropAction} className="flex gap-1.5"><input type="hidden" name="groupId" value={group.id} /><button disabled={groupDropPending} className="rounded-md bg-red-600 px-2.5 py-1.5 text-xs font-bold text-white disabled:opacity-60">Confirmer</button><button type="button" onClick={() => setConfirmingGroupId(null)} className="rounded-md border border-line px-2.5 py-1.5 text-xs font-semibold text-ink-soft">Annuler</button></form> : <button type="button" onClick={() => setConfirmingGroupId(group.id)} className="rounded-md border border-line p-1.5 text-red-700 hover:bg-red-50" title="Supprimer le groupe"><Trash2 className="h-3.5 w-3.5" /></button>}</div></td>
                  </tr>
                ))}
                {groupsWithHealth.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-ink-soft">Aucun groupe créé.</td></tr>}
              </tbody>
            </table>
          </div>
          {confirmingGroupId && <p className="mt-3 border-l-2 border-red-600 bg-red-50 px-3 py-2 text-xs leading-5 text-red-800">La suppression retire la structure et ses offres du SaaS, sans effacer les profils des MikroTik. Elle est refusée tant qu’un compte nominatif est encore rattaché à ce groupe.</p>}
          <Notice state={groupToggleState} /><Notice state={groupDropState} />
        </section>
      )}

      {activeView === "catalogue" && (
        <section className={`mt-5 ${panelClass}`}>
          <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.15em] text-brand">Référentiel commercial</p><h2 className="mt-1 text-2xl font-bold text-ink">Catalogue</h2><p className="mt-1 text-sm text-ink-soft">Les profils sont communs ; les offres choisissent où et à quel prix ils sont émis.</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => openDrawer("profile")} className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm font-semibold text-ink hover:bg-clay"><Plus className="h-4 w-4" /> Profil</button><button type="button" onClick={() => openDrawer("offer")} className="inline-flex items-center gap-2 rounded-md bg-ink px-3 py-2 text-sm font-semibold text-paper hover:bg-brand"><Plus className="h-4 w-4" /> Offre</button></div></div>
          <div className="mt-6 grid gap-5 xl:grid-cols-[0.88fr_1.12fr]">
            <div><div className="flex items-center justify-between"><h3 className="font-semibold text-ink">Profils communs</h3><Layers3 className="h-4 w-4 text-brand" /></div><div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">{profiles.map((profile) => <article key={profile.id} className="border border-line-soft p-4"><div className="flex justify-between gap-3"><div><h4 className="font-mono text-sm font-bold text-ink">{profile.name}</h4><p className="mt-1 text-xs text-ink-soft">{duration(profile.durationValue, profile.durationUnit)} · {profile.uploadMbps}M/{profile.downloadMbps}M</p></div><strong className="text-sm text-ink">{money(profile.defaultPriceCents)}</strong></div></article>)}{profiles.length === 0 && <p className="border border-dashed border-line-soft p-4 text-sm text-ink-soft">Ajoutez votre premier profil de vitesse et de durée.</p>}</div></div>
            <div><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold text-ink">Offres du groupe</h3><p className="mt-1 text-xs text-ink-soft">Tarif catalogue ou ajustement local.</p></div><select value={selectedGroup?.id ?? ""} onChange={(event) => setSelectedGroupId(event.target.value)} className="rounded-md border border-line-soft bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-brand">{groupsWithHealth.length === 0 && <option value="">Aucun groupe</option>}{groupsWithHealth.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></div><div className="mt-3 divide-y divide-line-soft border-y border-line-soft">{selectedOffers.map((offer) => <div key={offer.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-medium text-ink">{offer.profileName}</p><p className="mt-0.5 text-xs text-ink-soft">{offer.priceOverrideCents === null ? "Prix catalogue" : "Tarif spécifique au groupe"}{!offer.active && " · en pause"}</p></div><div className="flex items-center gap-2"><strong className={offer.active ? "text-ink" : "text-ink-soft line-through"}>{money(offer.effectivePriceCents)}</strong><form action={offerToggleAction}><input type="hidden" name="offerId" value={offer.id} /><input type="hidden" name="active" value={offer.active ? "false" : "true"} /><button disabled={offerTogglePending} className="rounded-md border border-line px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-clay disabled:opacity-60">{offer.active ? "Pause" : "Reprendre"}</button></form>{confirmingOfferId === offer.id ? <form action={offerDropAction} className="flex gap-1.5"><input type="hidden" name="offerId" value={offer.id} /><button disabled={offerDropPending} className="rounded-md bg-red-600 px-2 py-1.5 text-xs font-bold text-white disabled:opacity-60">{offerDropPending ? "…" : "Confirmer"}</button><button type="button" onClick={() => setConfirmingOfferId(null)} className="rounded-md border border-line px-2 py-1.5 text-xs font-semibold text-ink-soft">Annuler</button></form> : <button type="button" onClick={() => setConfirmingOfferId(offer.id)} className="rounded-md border border-line p-1.5 text-red-700 hover:bg-red-50" title="Retirer cette offre"><Trash2 className="h-3.5 w-3.5" /></button>}</div></div>)}{selectedGroup && selectedOffers.length === 0 && <p className="py-5 text-sm text-ink-soft">Aucune offre pour ce groupe.</p>}{!selectedGroup && <p className="py-5 text-sm text-ink-soft">Créez un groupe avant d’y activer une offre.</p>}</div></div>
          </div>
          <Notice state={offerToggleState} /><Notice state={offerDropState} />
        </section>
      )}

      {activeView === "accounts" && (
        <section className={`mt-5 ${panelClass}`}>
          <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.15em] text-brand">Accès d’équipe</p><h2 className="mt-1 text-2xl font-bold text-ink">Comptes</h2><p className="mt-1 text-sm text-ink-soft">Gérez les accès nominatifs sans exposer les mots de passe stockés sur les MikroTik.</p></div><button type="button" onClick={() => openDrawer("account")} className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2.5 text-sm font-bold text-paper hover:bg-brand"><UserPlus className="h-4 w-4" /> Nouveau compte</button></div>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3"><p className={labelClass}>Comptes existants</p><label className="sr-only" htmlFor="account-search">Rechercher un compte</label><input id="account-search" value={accountSearch} onChange={(event) => setAccountSearch(event.target.value)} placeholder="Rechercher un compte…" className="w-full rounded-md border border-line-soft bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-brand sm:w-64" /></div>
          <ul className="mt-2 divide-y divide-line-soft border-y border-line-soft">
            {visibleNamedUsers.map((user) => {
              const userOffers = offers.filter((offer) => offer.groupId === user.groupId && offer.active && offer.groupActive && offer.profileActive);
              return <li key={user.id} className="py-4">
                <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-mono text-sm font-bold text-ink">{user.username}</p><p className="mt-1 text-xs text-ink-soft">{[user.groupName, user.profileName, user.note].filter(Boolean).join(" · ") || "—"}</p></div><div className="flex flex-wrap items-center gap-1.5">{revealed[user.id] ? <code className="rounded bg-clay px-2 py-1.5 font-mono text-xs text-ink">{revealed[user.id]}</code> : <button type="button" onClick={async () => { const response = await revealRoamingUserPassword(user.id); const shown = ("password" in response ? response.password : response.error) ?? "indisponible"; setRevealed((previous) => ({ ...previous, [user.id]: shown })); }} className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs font-semibold text-ink-soft hover:bg-clay"><Eye className="h-3.5 w-3.5" /> Mot de passe</button>}<button type="button" onClick={() => { setEditingId(editingId === user.id ? null : user.id); setConfirmingId(null); setRevealed((previous) => { const next = { ...previous }; delete next[user.id]; return next; }); }} aria-expanded={editingId === user.id} className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-clay"><Pencil className="h-3.5 w-3.5" /> Modifier</button>{confirmingId === user.id ? <form action={deleteAction} className="flex items-center gap-1.5"><input type="hidden" name="voucherId" value={user.id} /><button disabled={deletePending} className="rounded-md bg-red-600 px-2.5 py-1.5 text-xs font-bold text-white disabled:opacity-60">{deletePending ? "Suppression…" : "Confirmer"}</button><button type="button" onClick={() => setConfirmingId(null)} className="rounded-md border border-line px-2.5 py-1.5 text-xs font-semibold text-ink-soft">Annuler</button></form> : <button type="button" onClick={() => { setConfirmingId(user.id); setEditingId(null); }} className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /> Supprimer</button>}</div></div>
                {confirmingId === user.id && <><p className="mt-3 border-l-2 border-red-600 bg-red-50 px-3 py-2 text-xs leading-5 text-red-800">Le compte sera retiré de toutes les zones du groupe, la session en cours sera coupée et l’appareil auto-connecté associé sera retiré. Si une zone ne répond pas, le compte reste dans la liste jusqu’à une révocation complète.</p><Notice state={deleteState} /></>}
                {editingId === user.id && <><form action={editAction} className="mt-3 border-l-2 border-brand bg-clay/30 p-3"><input type="hidden" name="voucherId" value={user.id} /><div className="grid gap-3 sm:grid-cols-2"><label className={labelClass}>Identifiant<input name="username" defaultValue={user.username} maxLength={32} pattern={ROAMING_USERNAME_PATTERN} title="Lettres, chiffres, point, tiret, souligné ou arobase — 2 à 32 caractères." className={`${inputClass} font-mono`} /></label><label className={labelClass}>Mot de passe <span className="normal-case tracking-normal">(vide = inchangé)</span><input name="password" maxLength={64} placeholder="inchangé" autoComplete="off" className={`${inputClass} font-mono`} /></label></div><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className={labelClass}>Offre <span className="normal-case tracking-normal">(vide = inchangée)</span><select name="offerId" disabled={userOffers.length === 0} className={inputClass}><option value="">Inchangée — {user.profileName ?? "—"}</option>{userOffers.map((offer) => <option key={offer.id} value={offer.id}>{offer.profileName} — {money(offer.effectivePriceCents)}</option>)}</select></label><label className={labelClass}>Rôle ou note<input name="note" defaultValue={user.note ?? ""} maxLength={180} className={inputClass} /></label></div><button disabled={editPending} className="mt-3 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-paper hover:bg-brand disabled:opacity-60">{editPending ? "Modification…" : "Enregistrer"}</button>{userOffers.length === 0 && <p className="mt-2 text-xs text-ink-soft">Aucune offre active n’est disponible pour le groupe de ce compte.</p>}</form><Notice state={editState} />{editState && "skipped" in editState && (editState.skipped?.length ?? 0) > 0 && <p className="mt-2 border-l-2 border-warn bg-clay/50 px-3 py-2 text-xs leading-5 text-ink-soft">Zones non mises à jour : <strong className="text-ink">{editState.skipped?.join(", ")}</strong> — relancez quand elles seront revenues.</p>}</>}
              </li>;
            })}
            {visibleNamedUsers.length === 0 && <li className="py-8 text-center text-sm text-ink-soft">{namedUsers.length ? "Aucun compte ne correspond à la recherche." : "Aucun compte nominatif pour l’instant."}</li>}
          </ul>
          <p className="mt-3 text-xs leading-5 text-ink-soft">Le SaaS ne conserve pas les mots de passe : ils sont relus à la demande sur le MikroTik, qui reste la source de vérité.</p>
        </section>
      )}

      {drawer && <div className="fixed inset-0 z-50 flex justify-end bg-ink/50 p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Panneau de gestion roaming"><div className="flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-paper shadow-[-8px_0_0_var(--color-brand)] sm:border-2 sm:border-line"><div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line-soft bg-paper p-5"><div><p className="text-xs font-semibold uppercase tracking-[0.15em] text-brand">Station roaming</p><h2 className="mt-1 text-xl font-bold text-ink">{drawer === "tickets" ? "Créer des accès" : drawer === "zone" ? "Ajouter une zone" : drawer === "group" ? "Nouveau groupe" : drawer === "profile" ? "Ajouter un profil" : drawer === "offer" ? "Activer une offre" : "Nouveau compte"}</h2></div><button type="button" onClick={() => setDrawer(null)} className="rounded-md border border-line p-2 text-ink hover:bg-clay" aria-label="Fermer"><X className="h-4 w-4" /></button></div><div className="p-5">
        {drawer === "tickets" && <form action={ticketAction}><p className="border-l-2 border-brand bg-clay/50 px-3 py-2 text-sm leading-6 text-ink-soft">Vérifier avant création : les accès seront posés à l’identique sur toutes les zones du groupe choisi.</p><label className={`mt-5 ${labelClass}`}>Groupe<select value={selectedGroup?.id ?? ""} onChange={(event) => setSelectedGroupId(event.target.value)} className={inputClass}>{groupsWithHealth.filter((group) => group.active).map((group) => <option key={group.id} value={group.id}>{group.name} · {group.onlineRouters.length}/{group.routers.length} en ligne</option>)}</select></label><input type="hidden" name="groupId" value={selectedGroup?.id ?? ""} /><label className={`mt-3 ${labelClass}`}>Offre<select name="offerId" required disabled={!selectedGroup?.active || selectableOffers.length === 0} className={inputClass}><option value="">{selectableOffers.length ? "Choisir un profil…" : "Aucune offre active"}</option>{selectableOffers.map((offer) => <option key={offer.id} value={offer.id}>{offer.profileName} — {money(offer.effectivePriceCents)}</option>)}</select></label><div className="mt-3 grid gap-3 sm:grid-cols-3"><label className={labelClass}>Quantité<input name="quantity" type="number" min="1" max="200" defaultValue="10" required className={inputClass} /></label><label className={labelClass}>Préfixe<input name="prefix" maxLength={10} placeholder="ex : nord" className={inputClass} /></label><label className={labelClass}>Note<input name="note" maxLength={180} placeholder="lot juillet" className={inputClass} /></label></div><button disabled={ticketPending || selectableOffers.length === 0} className="mt-5 rounded-md bg-brand px-5 py-2.5 text-sm font-bold text-ink shadow-[3px_3px_0_var(--color-ink)] disabled:opacity-60">{ticketPending ? "Provisionnement…" : "Créer les tickets"}</button><Notice state={ticketState} /></form>}
        {drawer === "zone" && <form action={groupZoneAction}><input type="hidden" name="groupId" value={groupForZone?.id ?? ""} /><p className="text-sm leading-6 text-ink-soft">Les comptes déjà créés sont synchronisés vers chaque zone ajoutée. Une zone existante ne peut pas être retirée ici, afin de ne pas laisser un accès actif derrière elle.</p><fieldset className="mt-5"><legend className={labelClass}>Nouvelles zones pour {groupForZone?.name ?? "ce groupe"}</legend><div className="mt-2 grid max-h-72 gap-1 overflow-y-auto rounded-md border border-line-soft p-2 sm:grid-cols-2">{routers.filter((router) => !groupForZone?.routers.some((member) => member.id === router.id)).map((router) => <label key={router.id} className="flex items-center gap-2 rounded px-2 py-2 text-sm text-ink hover:bg-clay"><input type="checkbox" name="routerIds" value={router.id} />{router.name}</label>)}{groupForZone && routers.every((router) => groupForZone.routers.some((member) => member.id === router.id)) && <span className="px-2 py-2 text-sm text-ink-soft">Tous vos MikroTik sont déjà dans ce groupe.</span>}</div></fieldset><button disabled={groupZonePending || !groupForZone} className="mt-5 rounded-md bg-ink px-4 py-2.5 text-sm font-semibold text-paper hover:bg-brand disabled:opacity-60">{groupZonePending ? "Synchronisation…" : "Ajouter les zones"}</button><Notice state={groupZoneState} /></form>}
        {drawer === "group" && <form action={groupAction}><p className="text-sm text-ink-soft">Un groupe définit les MikroTik qui recevront exactement les mêmes accès roaming.</p><div className="mt-5 grid gap-3 sm:grid-cols-2"><label className={labelClass}>Nom<input name="name" required placeholder="CIV roaming" className={inputClass} /></label><label className={labelClass}>Code <span className="normal-case tracking-normal">(optionnel)</span><input name="code" placeholder="CIV-ROAMING" className={inputClass} /></label></div><fieldset className="mt-4"><legend className={labelClass}>MikroTik couverts</legend><div className="mt-2 grid max-h-72 gap-1 overflow-y-auto rounded-md border border-line-soft p-2 sm:grid-cols-2">{routers.map((router) => <label key={router.id} className="flex items-center gap-2 rounded px-2 py-2 text-sm text-ink hover:bg-clay"><input type="checkbox" name="routerIds" value={router.id} />{router.name}</label>)}{routers.length === 0 && <span className="px-2 py-2 text-sm text-ink-soft">Aucun routeur disponible.</span>}</div></fieldset><button disabled={groupPending || routers.length === 0} className="mt-5 rounded-md bg-ink px-4 py-2.5 text-sm font-semibold text-paper hover:bg-brand disabled:opacity-60">{groupPending ? "Création…" : "Créer le groupe"}</button><Notice state={groupState} /></form>}
        {drawer === "profile" && <form action={profileAction}><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><label className={labelClass}>Durée<input name="durationValue" type="number" min="1" defaultValue="5" required={profileUnit !== "Unlimited"} disabled={profileUnit === "Unlimited"} className={`${inputClass} disabled:opacity-40`} /></label><label className={labelClass}>Unité<select name="durationUnit" value={profileUnit} onChange={(event) => setProfileUnit(event.target.value)} className={inputClass}><option value="Minutes">Minutes</option><option value="Hours">Heures</option><option value="Days">Jours</option><option value="Weeks">Semaines</option><option value="Months">Mois</option><option value="Unlimited">Illimité</option></select></label><label className={labelClass}>Montant<input name="uploadMbps" type="number" min="1" defaultValue="5" required className={inputClass} /></label><label className={labelClass}>Descendant<input name="downloadMbps" type="number" min="1" defaultValue="5" required className={inputClass} /></label></div><label className={`mt-4 ${labelClass}`}>Tarif catalogue (FCFA)<input name="defaultPriceCents" type="number" min="0" defaultValue="100" required className={inputClass} /></label>{profileUnit === "Unlimited" && <p className="mt-4 border-l-2 border-brand bg-clay/50 px-3 py-2 text-xs leading-5 text-ink-soft">Ce profil n’a pas d’expiration et est adapté aux administrateurs ou techniciens.</p>}<button disabled={profilePending} className="mt-5 rounded-md bg-ink px-4 py-2.5 text-sm font-semibold text-paper hover:bg-brand disabled:opacity-60">{profilePending ? "Ajout…" : "Ajouter le profil"}</button><Notice state={profileState} /></form>}
        {drawer === "offer" && <form action={offerAction}><label className={labelClass}>Groupe<select name="groupId" defaultValue={selectedGroup?.id ?? ""} required className={inputClass}><option value="">Choisir…</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label><label className={`mt-4 ${labelClass}`}>Profil<select name="profileId" required className={inputClass}><option value="">Choisir…</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name} — {money(profile.defaultPriceCents)}</option>)}</select></label><label className={`mt-4 ${labelClass}`}>Tarif du groupe <span className="normal-case tracking-normal">(laisser vide = catalogue)</span><input name="priceOverrideCents" inputMode="numeric" placeholder="Ex : 300" className={inputClass} /></label><button disabled={offerPending || groups.length === 0 || profiles.length === 0} className="mt-5 rounded-md bg-ink px-4 py-2.5 text-sm font-semibold text-paper hover:bg-brand disabled:opacity-60">{offerPending ? "Enregistrement…" : "Activer l’offre"}</button><Notice state={offerState} /></form>}
        {drawer === "account" && <form action={userAction}><input type="hidden" name="groupId" value={userGroupId} /><p className="text-sm leading-6 text-ink-soft">Le compte est posé sur toutes les zones du groupe. Son mot de passe n’est pas stocké dans le SaaS.</p><label className={`mt-5 ${labelClass}`}>Groupe<select value={userGroupId} onChange={(event) => setUserGroupId(event.target.value)} className={inputClass}><option value="">Choisir…</option>{groups.filter((group) => group.active).map((group) => <option key={group.id} value={group.id}>{group.name} · {group.routers.length} zone(s)</option>)}</select></label><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className={labelClass}>Identifiant<input name="username" required maxLength={32} pattern={ROAMING_USERNAME_PATTERN} title="Lettres, chiffres, point, tiret, souligné ou arobase — 2 à 32 caractères." placeholder="ex : aroune" autoComplete="off" className={`${inputClass} font-mono`} /></label><label className={labelClass}>Mot de passe <span className="normal-case tracking-normal">(vide = identique)</span><input name="password" maxLength={64} placeholder="ex : aroune" autoComplete="off" className={`${inputClass} font-mono`} /></label></div><label className={`mt-3 ${labelClass}`}>Offre<select name="offerId" required disabled={!userGroupId || userCreationOffers.length === 0} className={inputClass}><option value="">{userCreationOffers.length ? "Choisir un profil…" : "Aucune offre active pour ce groupe"}</option>{userCreationOffers.map((offer) => <option key={offer.id} value={offer.id}>{offer.profileName} — {money(offer.effectivePriceCents)}</option>)}</select></label><label className={`mt-3 ${labelClass}`}>Rôle ou note<input name="note" maxLength={180} placeholder="ex : technicien zone nord" className={inputClass} /></label><button disabled={userPending || !userGroupId || userCreationOffers.length === 0} className="mt-5 rounded-md bg-ink px-5 py-2.5 text-sm font-bold text-paper hover:bg-brand disabled:opacity-60">{userPending ? "Création…" : "Créer l’utilisateur"}</button><Notice state={userState} /></form>}
      </div></div></div>}

      <p className="mt-6 border-l-2 border-brand pl-3 text-xs leading-5 text-ink-soft">La première connexion fige la date d’expiration ; la station la réconcilie ensuite sur tous les routeurs du ticket. Le compteur centralisé temps réel sera ajouté avec le relais RADIUS dédié.</p>
    </div>
  );
}
