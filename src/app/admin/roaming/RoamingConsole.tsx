"use client";

import { useActionState, useMemo, useState } from "react";
import { Eye, Layers3, MapPin, Pause, Pencil, Play, Plus, Ticket, Trash2, UserPlus, X } from "lucide-react";
import {
  addRoamingGroupRouters,
  createRoamingGroup,
  createRoamingProfile,
  createRoamingUser,
  deleteRoamingGroup,
  removeRoamingGroupRouter,
  deleteRoamingOffer,
  deleteRoamingUser,
  generateRoamingVouchers,
  revealRoamingUserPassword,
  replaceRoamingDevice,
  resyncRoamingDevice,
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
  device: {
    macAddress: string;
    syncedZones: number;
    totalZones: number;
    pendingZones: { name: string; status: "PENDING" | "SYNCED" | "ERROR"; error: string | null }[];
  } | null;
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
      synchronizedOn?: number;
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
      className={`mt-3 rounded-lg px-3 py-2 text-sm ${state.error ? "bg-err-soft text-err" : "bg-clay text-ok"}`}
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
      <i className={`h-2 w-2 rounded-full ${online ? "bg-ok live-dot" : "bg-warn"}`} />
      <span>{online ? "En ligne" : "À vérifier"}</span>
    </span>
  );
}

const inputClass = "field mt-1";
const labelClass = "block text-xs font-medium text-ink-soft";
const panelClass = "rounded-2xl border border-line bg-paper p-5 sm:p-6";

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
  const [zoneDropState, zoneDropAction, zoneDropPending] = useActionState(removeRoamingGroupRouter, undefined);
  const [ticketState, ticketAction, ticketPending] = useActionState(generateRoamingVouchers, undefined);
  const [userState, userAction, userPending] = useActionState(createRoamingUser, undefined);
  const [editState, editAction, editPending] = useActionState(updateRoamingUser, undefined);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteRoamingUser, undefined);
  const [resyncState, resyncAction, resyncPending] = useActionState(resyncRoamingDevice, undefined);
  const [replaceDeviceState, replaceDeviceAction, replaceDevicePending] = useActionState(replaceRoamingDevice, undefined);

  const firstActiveGroupId = groups.find((group) => group.active)?.id ?? "";
  const [activeView, setActiveView] = useState<View>("operations");
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [selectedGroupId, setSelectedGroupId] = useState(firstActiveGroupId);
  const [userGroupId, setUserGroupId] = useState(firstActiveGroupId);
  const [addingZoneToGroupId, setAddingZoneToGroupId] = useState<string | null>(null);
  const [profileUnit, setProfileUnit] = useState("Hours");
  const [confirmingOfferId, setConfirmingOfferId] = useState<string | null>(null);
  const [confirmingGroupId, setConfirmingGroupId] = useState<string | null>(null);
  const [confirmingZoneId, setConfirmingZoneId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [replacingDeviceId, setReplacingDeviceId] = useState<string | null>(null);
  const [deviceNoticeId, setDeviceNoticeId] = useState<string | null>(null);
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
      {/* En-tête sobre : le titre dit OÙ l'on est, l'action principale est à
          droite. Les compteurs vivent dans la vue Exploitation, pas en double. */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Roaming</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-soft">
            Une même offre, valable sur plusieurs zones Wi-Fi. Vérifiez la couverture du groupe, puis
            créez les accès : ils sont posés à l’identique sur chacune de ses zones.
          </p>
        </div>
        <button
          type="button"
          onClick={() => openDrawer("tickets")}
          disabled={!selectedGroup?.active || selectableOffers.length === 0}
          className="btn btn-md btn-primary inline-flex items-center gap-2"
        >
          <Ticket aria-hidden="true" className="h-4 w-4" /> Créer des accès
        </button>
      </header>

      <nav aria-label="Navigation de la station roaming" className="mt-6 overflow-x-auto">
        <div className="inline-flex min-w-max gap-1 rounded-xl border border-line bg-clay/60 p-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveView(item.id)}
              aria-current={activeView === item.id ? "page" : undefined}
              className={`inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-sm ${
                activeView === item.id ? "bg-paper font-semibold text-ink shadow-menu" : "text-ink-soft hover:text-ink"
              }`}
            >
              {item.label}
              {item.count !== undefined && (
                <span className="rounded-full bg-clay px-1.5 text-xs tabular-nums text-ink-soft">{item.count}</span>
              )}
            </button>
          ))}
        </div>
      </nav>

      {activeView === "operations" && (
        <section className="mt-5 space-y-4">
          {/* Alerte de couverture : visible seulement quand elle compte. */}
          {offlineZoneCount > 0 ? (
            <div role="status" className="flex items-start gap-3 rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">
              <MapPin aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">
                  {offlineZoneCount} zone{offlineZoneCount > 1 ? "s" : ""} non joignable{offlineZoneCount > 1 ? "s" : ""} dans vos groupes
                </p>
                <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
                  {groupsWithHealth.flatMap((group) => group.offlineRouters.map((router) => <li key={`${group.id}-${router.id}`}>{router.name} <span className="opacity-75">· {group.name}</span></li>))}
                </ul>
              </div>
            </div>
          ) : groups.length > 0 && (
            <p className="flex items-center gap-2 text-sm text-ink-soft">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-ok" /> Toutes les zones de vos groupes répondent.
            </p>
          )}

          {groupsWithHealth.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line px-6 py-12 text-center">
              <p className="text-sm text-ink-soft">Créez un premier groupe et rattachez-lui les MikroTik concernés.</p>
              <button type="button" onClick={() => openDrawer("group")} className="btn btn-md btn-outline mt-4 inline-flex items-center gap-2"><Plus aria-hidden="true" className="h-4 w-4" /> Nouveau groupe</button>
            </div>
          ) : (
          <div className="grid grid-cols-1 overflow-hidden rounded-2xl border border-line bg-paper lg:grid-cols-[17rem_minmax(0,1fr)]">
            {/* Groupes : toute la flotte d'un coup d'œil, au lieu d'un menu déroulant. */}
            <div className="border-b border-line bg-clay/40 lg:border-b-0 lg:border-r">
              <p className="px-4 pb-2 pt-4 text-xs font-medium text-ink-soft">Groupe actif</p>
              <ul role="list" className="max-h-80 space-y-1 overflow-y-auto px-2 pb-3 lg:max-h-[40rem]">
                {groupsWithHealth.map((group) => {
                  const active = group.id === selectedGroup?.id;
                  const ratio = group.routers.length ? group.onlineRouters.length / group.routers.length : 0;
                  return (
                    <li key={group.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedGroupId(group.id)}
                        aria-current={active ? "true" : undefined}
                        className={`w-full rounded-lg px-3 py-2.5 text-left ${active ? "bg-paper shadow-menu" : "hover:bg-paper/70"}`}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className={`truncate text-sm text-ink ${active ? "font-semibold" : ""}`}>{group.name}</span>
                          {!group.active && <span className="shrink-0 rounded bg-clay px-1.5 text-[11px] text-ink-soft">En pause</span>}
                        </span>
                        <span className="mt-1.5 flex items-center gap-2">
                          <span aria-hidden="true" className="h-1.5 flex-1 overflow-hidden rounded-full bg-line-soft">
                            <span className={`block h-full rounded-full ${ratio === 1 ? "bg-ok" : "bg-warn"}`} style={{ width: `${Math.round(ratio * 100)}%` }} />
                          </span>
                          <span className="shrink-0 text-xs tabular-nums text-ink-soft">{group.onlineRouters.length}/{group.routers.length} zone(s) en ligne</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            {selectedGroup && (
              <div className="min-w-0 p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-ink-soft">{selectedGroup.code}</p>
                    <h2 className="mt-0.5 truncate text-lg font-semibold text-ink">{selectedGroup.name}</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold ${selectedGroup.active ? "bg-ok-soft text-ok" : "bg-clay text-ink-soft"}`}>
                      {selectedGroup.active && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />}
                      {selectedGroup.active ? "Émission active" : "Émission en pause"}
                    </span>
                    <button type="button" onClick={() => openDrawer("zone", selectedGroup.id)} className="btn btn-sm btn-outline inline-flex items-center gap-1.5"><Plus aria-hidden="true" className="h-3.5 w-3.5" /> Zone</button>
                  </div>
                </div>

                {/* Repères du groupe : une bande, au lieu de deux cartes et d'un encart. */}
                <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line-soft sm:grid-cols-4">
                  <div className="bg-paper px-4 py-3"><dt className="text-xs text-ink-soft">Zones en ligne</dt><dd className="mt-1 text-xl font-semibold tabular-nums text-ink"><span className={selectedGroup.offlineRouters.length ? "text-warn" : "text-ok"}>{selectedGroup.onlineRouters.length}</span><span className="text-sm text-ink-soft"> / {selectedGroup.routers.length}</span></dd></div>
                  <div className="bg-paper px-4 py-3"><dt className="text-xs text-ink-soft">Comptes nominatifs</dt><dd className="mt-1 text-xl font-semibold tabular-nums text-ink">{selectedNamedUsers.length}</dd></div>
                  <div className="bg-paper px-4 py-3"><dt className="text-xs text-ink-soft">Offres prêtes à émettre</dt><dd className="mt-1 text-xl font-semibold tabular-nums text-ink">{selectableOffers.length}</dd></div>
                  <div className="bg-paper px-4 py-3"><dt className="text-xs text-ink-soft">Profils communs</dt><dd className="mt-1 text-xl font-semibold tabular-nums text-ink">{profiles.length}</dd></div>
                </dl>
                <div className="mt-2 flex flex-wrap gap-x-4 text-xs">
                  <button type="button" onClick={() => setActiveView("catalogue")} className="font-semibold text-ink hover:underline">Gérer le catalogue</button>
                  <button type="button" onClick={() => setActiveView("accounts")} className="font-semibold text-ink hover:underline">Voir les comptes</button>
                </div>

                <div className="mt-6">
                  <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-ink">Couverture du groupe</h3><span className="text-xs text-ink-soft">{selectedGroup.routers.length} zone(s)</span></div>
                  <ul className="mt-2 divide-y divide-line-soft rounded-xl border border-line">
                    {selectedGroup.routers.map((router) => <li key={router.id} className="flex items-center justify-between gap-3 px-4 py-3"><span className="min-w-0 truncate text-sm font-medium text-ink">{router.name}</span><span className="flex shrink-0 items-center gap-3"><span className="text-xs text-ink-soft"><StatusDot status={router.status} /></span>{confirmingZoneId === router.id ? <form action={zoneDropAction} className="flex gap-1.5"><input type="hidden" name="groupId" value={selectedGroup.id} /><input type="hidden" name="routerId" value={router.id} /><button disabled={zoneDropPending} className="btn btn-sm btn-destructive">{zoneDropPending ? "Retrait…" : "Confirmer"}</button><button type="button" onClick={() => setConfirmingZoneId(null)} className="btn btn-sm btn-ghost">Annuler</button></form> : <button type="button" onClick={() => setConfirmingZoneId(router.id)} className="rounded-lg p-1.5 text-ink-soft hover:bg-err-soft hover:text-err" title={`Retirer ${router.name} du groupe`} aria-label={`Retirer ${router.name} du groupe`}><Trash2 className="h-3.5 w-3.5" /></button>}</span></li>)}
                    {selectedGroup.routers.length === 0 && <li className="px-4 py-4 text-sm text-ink-soft">Aucune zone dans ce groupe.</li>}
                  </ul>
                  {confirmingZoneId && <p className="mt-3 rounded-lg bg-err-soft px-3 py-2 text-xs leading-5 text-err">Le retrait efface d’abord les comptes du groupe SUR ce MikroTik, puis détache la zone. Il est refusé si le routeur ne répond pas — sinon les comptes y resteraient actifs sans plus aucun bouton pour les couper — et refusé aussi sur la dernière zone d’un groupe qui porte encore des comptes, dont les mots de passe ne sont lisibles que sur une zone vivante.</p>}
                  <Notice state={zoneDropState} />
                </div>
              </div>
            )}
          </div>
          )}
        </section>
      )}

      {activeView === "groups" && (
        <section className={`mt-5 ${panelClass}`}>
          <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-ink">Groupes & zones</h2><p className="mt-1 text-sm text-ink-soft">Comparez les couvertures puis intervenez sur le bon groupe.</p></div><button type="button" onClick={() => openDrawer("group")} className="btn btn-md btn-secondary inline-flex items-center gap-2"><Plus className="h-4 w-4" /> Nouveau groupe</button></div>
          <div className="mt-6 overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-clay/60 text-xs text-ink-soft"><tr><th className="px-4 py-3 font-semibold">Groupe</th><th className="px-4 py-3 font-semibold">Couverture</th><th className="px-4 py-3 font-semibold">Émission</th><th className="px-4 py-3 font-semibold text-right">Actions</th></tr></thead>
              <tbody className="divide-y divide-line-soft">
                {groupsWithHealth.map((group) => (
                  <tr key={group.id} className={group.id === selectedGroup?.id ? "bg-clay/60" : "bg-paper"}>
                    <td className="px-4 py-4"><button type="button" onClick={() => selectGroup(group.id)} className="text-left hover:underline"><span className="block font-semibold text-ink">{group.name}</span><span className="font-mono text-xs text-ink-soft">{group.code}</span></button></td>
                    <td className="px-4 py-4"><span className="font-semibold text-ok">{group.onlineRouters.length}</span><span className="text-ink-soft">/{group.routers.length} en ligne</span>{group.offlineRouters.length > 0 && <span className="ml-2 text-xs text-warn">· {group.offlineRouters.length} à vérifier</span>}</td>
                    <td className="px-4 py-4"><form action={groupToggleAction}><input type="hidden" name="groupId" value={group.id} /><input type="hidden" name="active" value={group.active ? "false" : "true"} /><button disabled={groupTogglePending} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold disabled:opacity-60 ${group.active ? "bg-ok-soft text-ok" : "bg-clay text-ink-soft"}`}>{group.active ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}{group.active ? "Active" : "En pause"}</button></form></td>
                    <td className="px-4 py-4"><div className="flex justify-end gap-2"><button type="button" onClick={() => openDrawer("zone", group.id)} className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-clay">Zones</button>{confirmingGroupId === group.id ? <form action={groupDropAction} className="flex gap-1.5"><input type="hidden" name="groupId" value={group.id} /><button disabled={groupDropPending} className="btn btn-sm btn-destructive">Confirmer</button><button type="button" onClick={() => setConfirmingGroupId(null)} className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-ink-soft">Annuler</button></form> : <button type="button" onClick={() => setConfirmingGroupId(group.id)} className="rounded-lg border border-line p-1.5 text-err hover:bg-err-soft" title="Supprimer le groupe"><Trash2 className="h-3.5 w-3.5" /></button>}</div></td>
                  </tr>
                ))}
                {groupsWithHealth.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-ink-soft">Aucun groupe créé.</td></tr>}
              </tbody>
            </table>
          </div>
          {confirmingGroupId && <p className="mt-3 rounded-lg bg-err-soft px-3 py-2 text-xs leading-5 text-err">La suppression retire la structure et ses offres du SaaS, sans effacer les profils des MikroTik. Elle est refusée tant qu’un compte nominatif est encore rattaché à ce groupe.</p>}
          <Notice state={groupToggleState} /><Notice state={groupDropState} />
        </section>
      )}

      {activeView === "catalogue" && (
        <section className={`mt-5 ${panelClass}`}>
          <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-ink">Catalogue</h2><p className="mt-1 text-sm text-ink-soft">Les profils sont communs ; les offres choisissent où et à quel prix ils sont émis.</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => openDrawer("profile")} className="btn btn-md btn-outline inline-flex items-center gap-2"><Plus className="h-4 w-4" /> Profil</button><button type="button" onClick={() => openDrawer("offer")} className="btn btn-md btn-secondary inline-flex items-center gap-2"><Plus className="h-4 w-4" /> Offre</button></div></div>
          <div className="mt-6 grid gap-5 xl:grid-cols-[0.88fr_1.12fr]">
            <div><div className="flex items-center justify-between"><h3 className="font-semibold text-ink">Profils communs</h3><Layers3 aria-hidden="true" className="h-4 w-4 text-ink-soft" /></div><div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">{profiles.map((profile) => <article key={profile.id} className="rounded-xl border border-line p-4"><div className="flex justify-between gap-3"><div><h4 className="font-mono text-sm font-bold text-ink">{profile.name}</h4><p className="mt-1 text-xs text-ink-soft">{duration(profile.durationValue, profile.durationUnit)} · {profile.uploadMbps}M/{profile.downloadMbps}M</p></div><strong className="text-sm text-ink">{money(profile.defaultPriceCents)}</strong></div></article>)}{profiles.length === 0 && <p className="border border-dashed border-line-soft p-4 text-sm text-ink-soft">Ajoutez votre premier profil de vitesse et de durée.</p>}</div></div>
            <div><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold text-ink">Offres du groupe</h3><p className="mt-1 text-xs text-ink-soft">Tarif catalogue ou ajustement local.</p></div><select value={selectedGroup?.id ?? ""} onChange={(event) => setSelectedGroupId(event.target.value)} className="field w-auto">{groupsWithHealth.length === 0 && <option value="">Aucun groupe</option>}{groupsWithHealth.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></div><div className="mt-3 divide-y divide-line-soft border-y border-line-soft">{selectedOffers.map((offer) => <div key={offer.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-medium text-ink">{offer.profileName}</p><p className="mt-0.5 text-xs text-ink-soft">{offer.priceOverrideCents === null ? "Prix catalogue" : "Tarif spécifique au groupe"}{!offer.active && " · en pause"}</p></div><div className="flex items-center gap-2"><strong className={offer.active ? "text-ink" : "text-ink-soft line-through"}>{money(offer.effectivePriceCents)}</strong><form action={offerToggleAction}><input type="hidden" name="offerId" value={offer.id} /><input type="hidden" name="active" value={offer.active ? "false" : "true"} /><button disabled={offerTogglePending} className="btn btn-sm btn-outline">{offer.active ? "Pause" : "Reprendre"}</button></form>{confirmingOfferId === offer.id ? <form action={offerDropAction} className="flex gap-1.5"><input type="hidden" name="offerId" value={offer.id} /><button disabled={offerDropPending} className="btn btn-sm btn-destructive">{offerDropPending ? "…" : "Confirmer"}</button><button type="button" onClick={() => setConfirmingOfferId(null)} className="rounded-lg border border-line px-2 py-1.5 text-xs font-semibold text-ink-soft">Annuler</button></form> : <button type="button" onClick={() => setConfirmingOfferId(offer.id)} className="rounded-lg border border-line p-1.5 text-err hover:bg-err-soft" title="Retirer cette offre"><Trash2 className="h-3.5 w-3.5" /></button>}</div></div>)}{selectedGroup && selectedOffers.length === 0 && <p className="py-5 text-sm text-ink-soft">Aucune offre pour ce groupe.</p>}{!selectedGroup && <p className="py-5 text-sm text-ink-soft">Créez un groupe avant d’y activer une offre.</p>}</div></div>
          </div>
          <Notice state={offerToggleState} /><Notice state={offerDropState} />
        </section>
      )}

      {activeView === "accounts" && (
        <section className={`mt-5 ${panelClass}`}>
          <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-ink">Comptes</h2><p className="mt-1 text-sm text-ink-soft">Gérez les accès nominatifs sans exposer les mots de passe stockés sur les MikroTik.</p></div><button type="button" onClick={() => openDrawer("account")} className="btn btn-md btn-secondary inline-flex items-center gap-2"><UserPlus className="h-4 w-4" /> Nouveau compte</button></div>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3"><p className={labelClass}>Comptes existants</p><label className="sr-only" htmlFor="account-search">Rechercher un compte</label><input id="account-search" value={accountSearch} onChange={(event) => setAccountSearch(event.target.value)} placeholder="Rechercher un compte…" className="field sm:w-64" /></div>
          <ul className="mt-2 divide-y divide-line-soft border-y border-line-soft">
            {visibleNamedUsers.map((user) => {
              const userOffers = offers.filter((offer) => offer.groupId === user.groupId && offer.active && offer.groupActive && offer.profileActive);
              return <li key={user.id} className="py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><p className="font-mono text-sm font-bold text-ink">{user.username}</p><p className="mt-1 text-xs text-ink-soft">{[user.groupName, user.profileName, user.note].filter(Boolean).join(" · ") || "—"}</p></div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {revealed[user.id] ? <code className="rounded bg-clay px-2 py-1.5 font-mono text-xs text-ink">{revealed[user.id]}</code> : <button type="button" onClick={async () => { const response = await revealRoamingUserPassword(user.id); const shown = ("password" in response ? response.password : response.error) ?? "indisponible"; setRevealed((previous) => ({ ...previous, [user.id]: shown })); }} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-ink-soft hover:bg-clay"><Eye className="h-3.5 w-3.5" /> Mot de passe</button>}
                    <button type="button" onClick={() => { setEditingId(editingId === user.id ? null : user.id); setConfirmingId(null); setReplacingDeviceId(null); setRevealed((previous) => { const next = { ...previous }; delete next[user.id]; return next; }); }} aria-expanded={editingId === user.id} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-clay"><Pencil className="h-3.5 w-3.5" /> Modifier</button>
                    {confirmingId === user.id ? <form action={deleteAction} className="flex items-center gap-1.5"><input type="hidden" name="voucherId" value={user.id} /><button disabled={deletePending} className="btn btn-sm btn-destructive">{deletePending ? "Suppression…" : "Confirmer"}</button><button type="button" onClick={() => setConfirmingId(null)} className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-ink-soft">Annuler</button></form> : <button type="button" onClick={() => { setConfirmingId(user.id); setEditingId(null); setReplacingDeviceId(null); }} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-err hover:bg-err-soft"><Trash2 className="h-3.5 w-3.5" /> Supprimer</button>}
                  </div>
                </div>
                <div className="mt-3 rounded-lg bg-clay/50 px-3 py-2 text-xs leading-5 text-ink-soft">
                  {user.device ? <>
                    <p><strong className="text-ink">Appareil mémorisé</strong> · <code className="font-mono">{user.device.macAddress}</code> · {user.device.syncedZones}/{user.device.totalZones} zones synchronisées</p>
                    {user.device.pendingZones.length > 0 && <p className="mt-1 text-warn">À reprendre : {user.device.pendingZones.map((zone) => zone.name).join(", ")}</p>}
                    <p className="mt-1">Le code reste saisissable partout : si le téléphone revient avec une autre adresse privée, la liaison suit d’elle-même après une connexion réussie.</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <form action={resyncAction} onSubmit={() => setDeviceNoticeId(user.id)}><input type="hidden" name="voucherId" value={user.id} /><button disabled={resyncPending} className="btn btn-sm btn-outline">{resyncPending ? "Resynchronisation…" : "Resynchroniser"}</button></form>
                      {replacingDeviceId === user.id ? <form action={replaceDeviceAction} onSubmit={() => setDeviceNoticeId(user.id)} className="flex flex-wrap items-center gap-1.5"><input type="hidden" name="voucherId" value={user.id} /><button disabled={replaceDevicePending} className="rounded-lg bg-warn px-2.5 py-1.5 text-xs font-bold text-white disabled:opacity-60">{replaceDevicePending ? "Réinitialisation…" : "Confirmer le changement"}</button><button type="button" onClick={() => setReplacingDeviceId(null)} className="rounded-lg border border-line bg-paper px-2.5 py-1.5 text-xs font-semibold text-ink-soft">Annuler</button></form> : <button type="button" onClick={() => { setReplacingDeviceId(user.id); setConfirmingId(null); }} className="rounded-lg border border-line bg-paper px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-clay">Changer d’appareil</button>}
                    </div>
                    {replacingDeviceId === user.id && <p className="mt-2 text-ink">Les sessions et cookies de l’ancien appareil seront retirés de toutes les zones avant qu’un nouvel appareil puisse être mémorisé.</p>}
                  </> : <p><strong className="text-ink">Aucun appareil mémorisé.</strong> La première connexion réussie l’enregistrera pour toutes les zones du groupe.</p>}
                  {deviceNoticeId === user.id && <><Notice state={resyncState} /><Notice state={replaceDeviceState} /></>}
                </div>
                {confirmingId === user.id && <><p className="mt-3 rounded-lg bg-err-soft px-3 py-2 text-xs leading-5 text-err">Le compte sera retiré de toutes les zones du groupe, la session en cours sera coupée et l’appareil auto-connecté associé sera retiré. Si une zone ne répond pas, le compte reste dans la liste jusqu’à une révocation complète.</p><Notice state={deleteState} /></>}
                {editingId === user.id && <><form action={editAction} className="mt-3 rounded-lg bg-clay/50 p-3"><input type="hidden" name="voucherId" value={user.id} /><div className="grid gap-3 sm:grid-cols-2"><label className={labelClass}>Identifiant<input name="username" defaultValue={user.username} maxLength={32} pattern={ROAMING_USERNAME_PATTERN} title="Lettres, chiffres, point, tiret, souligné ou arobase — 2 à 32 caractères." className={`${inputClass} font-mono`} /></label><label className={labelClass}>Mot de passe <span className="normal-case tracking-normal">(vide = inchangé)</span><input name="password" maxLength={64} placeholder="inchangé" autoComplete="off" className={`${inputClass} font-mono`} /></label></div><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className={labelClass}>Offre <span className="normal-case tracking-normal">(vide = inchangée)</span><select name="offerId" disabled={userOffers.length === 0} className={inputClass}><option value="">Inchangée — {user.profileName ?? "—"}</option>{userOffers.map((offer) => <option key={offer.id} value={offer.id}>{offer.profileName} — {money(offer.effectivePriceCents)}</option>)}</select></label><label className={labelClass}>Rôle ou note<input name="note" defaultValue={user.note ?? ""} maxLength={180} className={inputClass} /></label></div><button disabled={editPending} className="btn btn-md btn-secondary mt-3">{editPending ? "Modification…" : "Enregistrer"}</button>{userOffers.length === 0 && <p className="mt-2 text-xs text-ink-soft">Aucune offre active n’est disponible pour le groupe de ce compte.</p>}</form><Notice state={editState} />{editState && "skipped" in editState && (editState.skipped?.length ?? 0) > 0 && <p className="mt-2 rounded-lg bg-warn-soft px-3 py-2 text-xs leading-5 text-ink-soft">Zones non mises à jour : <strong className="text-ink">{editState.skipped?.join(", ")}</strong> — relancez quand elles seront revenues.</p>}</>}
              </li>;
            })}
            {visibleNamedUsers.length === 0 && <li className="py-8 text-center text-sm text-ink-soft">{namedUsers.length ? "Aucun compte ne correspond à la recherche." : "Aucun compte nominatif pour l’instant."}</li>}
          </ul>
          <p className="mt-3 text-xs leading-5 text-ink-soft">Le SaaS ne conserve pas les mots de passe : ils sont relus à la demande sur le MikroTik, qui reste la source de vérité.</p>
        </section>
      )}

      {drawer && <div className="fixed inset-0 z-50 flex justify-end bg-ink/50 p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Panneau de gestion roaming"><div className="flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-paper shadow-modal sm:rounded-2xl sm:border sm:border-line"><div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line-soft bg-paper p-5"><div><h2 className="text-lg font-semibold text-ink">{drawer === "tickets" ? "Créer des accès" : drawer === "zone" ? "Ajouter une zone" : drawer === "group" ? "Nouveau groupe" : drawer === "profile" ? "Ajouter un profil" : drawer === "offer" ? "Activer une offre" : "Nouveau compte"}</h2></div><button type="button" onClick={() => setDrawer(null)} className="rounded-lg border border-line p-2 text-ink hover:bg-clay" aria-label="Fermer"><X className="h-4 w-4" /></button></div><div className="p-5">
        {drawer === "tickets" && <form action={ticketAction}><p className="rounded-lg bg-clay/50 px-3 py-2 text-sm leading-6 text-ink-soft">Vérifier avant création : les accès seront posés à l’identique sur toutes les zones du groupe choisi.</p><label className={`mt-5 ${labelClass}`}>Groupe<select value={selectedGroup?.id ?? ""} onChange={(event) => setSelectedGroupId(event.target.value)} className={inputClass}>{groupsWithHealth.filter((group) => group.active).map((group) => <option key={group.id} value={group.id}>{group.name} · {group.onlineRouters.length}/{group.routers.length} en ligne</option>)}</select></label><input type="hidden" name="groupId" value={selectedGroup?.id ?? ""} /><label className={`mt-3 ${labelClass}`}>Offre<select name="offerId" required disabled={!selectedGroup?.active || selectableOffers.length === 0} className={inputClass}><option value="">{selectableOffers.length ? "Choisir un profil…" : "Aucune offre active"}</option>{selectableOffers.map((offer) => <option key={offer.id} value={offer.id}>{offer.profileName} — {money(offer.effectivePriceCents)}</option>)}</select></label><div className="mt-3 grid gap-3 sm:grid-cols-3"><label className={labelClass}>Quantité<input name="quantity" type="number" min="1" max="200" defaultValue="10" required className={inputClass} /></label><label className={labelClass}>Préfixe<input name="prefix" maxLength={10} placeholder="ex : nord" className={inputClass} /></label><label className={labelClass}>Note<input name="note" maxLength={180} placeholder="lot juillet" className={inputClass} /></label></div><button disabled={ticketPending || selectableOffers.length === 0} className="btn btn-md btn-primary mt-5">{ticketPending ? "Provisionnement…" : "Créer les tickets"}</button><Notice state={ticketState} /></form>}
        {drawer === "zone" && <form action={groupZoneAction}><input type="hidden" name="groupId" value={groupForZone?.id ?? ""} /><p className="text-sm leading-6 text-ink-soft">Les comptes déjà créés sont synchronisés vers chaque zone ajoutée. Pour retirer une zone, passez par la couverture du groupe : le retrait efface les comptes du MikroTik concerné avant de le détacher.</p><fieldset className="mt-5"><legend className={labelClass}>Nouvelles zones pour {groupForZone?.name ?? "ce groupe"}</legend><div className="mt-2 grid max-h-72 gap-1 overflow-y-auto rounded-lg border border-line-soft p-2 sm:grid-cols-2">{routers.filter((router) => !groupForZone?.routers.some((member) => member.id === router.id)).map((router) => <label key={router.id} className="flex items-center gap-2 rounded px-2 py-2 text-sm text-ink hover:bg-clay"><input type="checkbox" name="routerIds" value={router.id} />{router.name}</label>)}{groupForZone && routers.every((router) => groupForZone.routers.some((member) => member.id === router.id)) && <span className="px-2 py-2 text-sm text-ink-soft">Tous vos MikroTik sont déjà dans ce groupe.</span>}</div></fieldset><button disabled={groupZonePending || !groupForZone} className="btn btn-md btn-secondary mt-5">{groupZonePending ? "Synchronisation…" : "Ajouter les zones"}</button><Notice state={groupZoneState} /></form>}
        {drawer === "group" && <form action={groupAction}><p className="text-sm text-ink-soft">Un groupe définit les MikroTik qui recevront exactement les mêmes accès roaming.</p><div className="mt-5 grid gap-3 sm:grid-cols-2"><label className={labelClass}>Nom<input name="name" required placeholder="CIV roaming" className={inputClass} /></label><label className={labelClass}>Code <span className="normal-case tracking-normal">(optionnel)</span><input name="code" placeholder="CIV-ROAMING" className={inputClass} /></label></div><fieldset className="mt-4"><legend className={labelClass}>MikroTik couverts</legend><div className="mt-2 grid max-h-72 gap-1 overflow-y-auto rounded-lg border border-line-soft p-2 sm:grid-cols-2">{routers.map((router) => <label key={router.id} className="flex items-center gap-2 rounded px-2 py-2 text-sm text-ink hover:bg-clay"><input type="checkbox" name="routerIds" value={router.id} />{router.name}</label>)}{routers.length === 0 && <span className="px-2 py-2 text-sm text-ink-soft">Aucun routeur disponible.</span>}</div></fieldset><button disabled={groupPending || routers.length === 0} className="btn btn-md btn-secondary mt-5">{groupPending ? "Création…" : "Créer le groupe"}</button><Notice state={groupState} /></form>}
        {drawer === "profile" && <form action={profileAction}><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><label className={labelClass}>Durée<input name="durationValue" type="number" min="1" defaultValue="5" required={profileUnit !== "Unlimited"} disabled={profileUnit === "Unlimited"} className={`${inputClass} disabled:opacity-40`} /></label><label className={labelClass}>Unité<select name="durationUnit" value={profileUnit} onChange={(event) => setProfileUnit(event.target.value)} className={inputClass}><option value="Minutes">Minutes</option><option value="Hours">Heures</option><option value="Days">Jours</option><option value="Weeks">Semaines</option><option value="Months">Mois</option><option value="Unlimited">Illimité</option></select></label><label className={labelClass}>Montant<input name="uploadMbps" type="number" min="1" defaultValue="5" required className={inputClass} /></label><label className={labelClass}>Descendant<input name="downloadMbps" type="number" min="1" defaultValue="5" required className={inputClass} /></label></div><label className={`mt-4 ${labelClass}`}>Tarif catalogue (FCFA)<input name="defaultPriceCents" type="number" min="0" defaultValue="100" required className={inputClass} /></label>{profileUnit === "Unlimited" && <p className="mt-4 rounded-lg bg-clay/50 px-3 py-2 text-xs leading-5 text-ink-soft">Ce profil n’a pas d’expiration et est adapté aux administrateurs ou techniciens.</p>}<button disabled={profilePending} className="btn btn-md btn-secondary mt-5">{profilePending ? "Ajout…" : "Ajouter le profil"}</button><Notice state={profileState} /></form>}
        {drawer === "offer" && <form action={offerAction}><label className={labelClass}>Groupe<select name="groupId" defaultValue={selectedGroup?.id ?? ""} required className={inputClass}><option value="">Choisir…</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label><label className={`mt-4 ${labelClass}`}>Profil<select name="profileId" required className={inputClass}><option value="">Choisir…</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name} — {money(profile.defaultPriceCents)}</option>)}</select></label><label className={`mt-4 ${labelClass}`}>Tarif du groupe <span className="normal-case tracking-normal">(laisser vide = catalogue)</span><input name="priceOverrideCents" inputMode="numeric" placeholder="Ex : 300" className={inputClass} /></label><button disabled={offerPending || groups.length === 0 || profiles.length === 0} className="btn btn-md btn-secondary mt-5">{offerPending ? "Enregistrement…" : "Activer l’offre"}</button><Notice state={offerState} /></form>}
        {drawer === "account" && <form action={userAction}><input type="hidden" name="groupId" value={userGroupId} /><p className="text-sm leading-6 text-ink-soft">Le compte est posé sur toutes les zones du groupe. Son mot de passe n’est pas stocké dans le SaaS.</p><label className={`mt-5 ${labelClass}`}>Groupe<select value={userGroupId} onChange={(event) => setUserGroupId(event.target.value)} className={inputClass}><option value="">Choisir…</option>{groups.filter((group) => group.active).map((group) => <option key={group.id} value={group.id}>{group.name} · {group.routers.length} zone(s)</option>)}</select></label><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className={labelClass}>Identifiant<input name="username" required maxLength={32} pattern={ROAMING_USERNAME_PATTERN} title="Lettres, chiffres, point, tiret, souligné ou arobase — 2 à 32 caractères." placeholder="ex : aroune" autoComplete="off" className={`${inputClass} font-mono`} /></label><label className={labelClass}>Mot de passe <span className="normal-case tracking-normal">(vide = identique)</span><input name="password" maxLength={64} placeholder="ex : aroune" autoComplete="off" className={`${inputClass} font-mono`} /></label></div><label className={`mt-3 ${labelClass}`}>Offre<select name="offerId" required disabled={!userGroupId || userCreationOffers.length === 0} className={inputClass}><option value="">{userCreationOffers.length ? "Choisir un profil…" : "Aucune offre active pour ce groupe"}</option>{userCreationOffers.map((offer) => <option key={offer.id} value={offer.id}>{offer.profileName} — {money(offer.effectivePriceCents)}</option>)}</select></label><label className={`mt-3 ${labelClass}`}>Rôle ou note<input name="note" maxLength={180} placeholder="ex : technicien zone nord" className={inputClass} /></label><button disabled={userPending || !userGroupId || userCreationOffers.length === 0} className="btn btn-md btn-secondary mt-5">{userPending ? "Création…" : "Créer l’utilisateur"}</button><Notice state={userState} /></form>}
      </div></div></div>}

      <p className="mt-6 text-xs leading-5 text-ink-soft">La première connexion fige la date d’expiration ; la station la réconcilie ensuite sur tous les routeurs du ticket. Le compteur centralisé temps réel sera ajouté avec le relais RADIUS dédié.</p>
    </div>
  );
}
