"use client";

import { useActionState, useMemo, useState } from "react";
import {
  Eye,
  Layers3,
  MapPin,
  Pencil,
  Plus,
  Ticket,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import {
  addRoamingGroupRouters,
  createRoamingGroup,
  createRoamingProfile,
  createRoamingUser,
  removeRoamingGroupRouter,
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
import { roamingIssuanceIsLive } from "@/lib/roaming/issuance-lifetime";
import RoamingManageActions from "./RoamingManageActions";
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
  status?: string;
  groupId: string | null;
  profileName: string | null;
  groupName: string | null;
  note: string | null;
  createdAt: string;
  device: {
    macAddress: string;
    syncedZones: number;
    totalZones: number;
    pendingZones: {
      name: string;
      status: "PENDING" | "SYNCED" | "ERROR";
      error: string | null;
    }[];
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
type View = "groups" | "catalogue" | "accounts";
type Drawer =
  | "tickets"
  | "zone"
  | "group"
  | "profile"
  | "offer"
  | "account"
  | null;

function money(value: number) {
  return `${value.toLocaleString("fr-FR")} F`;
}

function duration(value: number, unit: string) {
  if (unit === "Unlimited") return "Illimité — sans expiration";
  const label =
    {
      Minutes: "min",
      Hours: "h",
      Days: "jour(s)",
      Weeks: "sem.",
      Months: "mois",
    }[unit] ?? unit;
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
      <i
        className={`h-2 w-2 rounded-full ${online ? "bg-ok live-dot" : "bg-warn"}`}
      />
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
  const [groupState, groupAction, groupPending] = useActionState(
    createRoamingGroup,
    undefined,
  );
  const [groupZoneState, groupZoneAction, groupZonePending] = useActionState(
    addRoamingGroupRouters,
    undefined,
  );
  const [profileState, profileAction, profilePending] = useActionState(
    createRoamingProfile,
    undefined,
  );
  const [offerState, offerAction, offerPending] = useActionState(
    saveRoamingOffer,
    undefined,
  );
  const [offerToggleState, offerToggleAction, offerTogglePending] =
    useActionState(setRoamingOfferActive, undefined);
  const [groupToggleState, groupToggleAction, groupTogglePending] =
    useActionState(setRoamingGroupActive, undefined);
  const [zoneDropState, zoneDropAction, zoneDropPending] = useActionState(
    removeRoamingGroupRouter,
    undefined,
  );
  const [ticketState, ticketAction, ticketPending] = useActionState(
    generateRoamingVouchers,
    undefined,
  );
  const [userState, userAction, userPending] = useActionState(
    createRoamingUser,
    undefined,
  );
  const [editState, editAction, editPending] = useActionState(
    updateRoamingUser,
    undefined,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteRoamingUser,
    undefined,
  );
  const [resyncState, resyncAction, resyncPending] = useActionState(
    resyncRoamingDevice,
    undefined,
  );
  const [replaceDeviceState, replaceDeviceAction, replaceDevicePending] =
    useActionState(replaceRoamingDevice, undefined);

  const firstActiveGroupId = groups.find((group) => group.active)?.id ?? "";
  const [activeView, setActiveView] = useState<View>("groups");
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [selectedGroupId, setSelectedGroupId] = useState(firstActiveGroupId);
  const [userGroupId, setUserGroupId] = useState(firstActiveGroupId);
  const [addingZoneToGroupId, setAddingZoneToGroupId] = useState<string | null>(
    null,
  );
  const [profileUnit, setProfileUnit] = useState("Hours");
  const [confirmingZoneId, setConfirmingZoneId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [replacingDeviceId, setReplacingDeviceId] = useState<string | null>(
    null,
  );
  const [deviceNoticeId, setDeviceNoticeId] = useState<string | null>(null);
  const [accountSearch, setAccountSearch] = useState("");

  const groupsWithHealth = useMemo(
    () =>
      groups.map((group) => ({
        ...group,
        onlineRouters: group.routers.filter(
          (router) => router.status === "online",
        ),
        offlineRouters: group.routers.filter(
          (router) => router.status !== "online",
        ),
      })),
    [groups],
  );
  const selectedGroup =
    groupsWithHealth.find((group) => group.id === selectedGroupId) ??
    groupsWithHealth[0] ??
    null;
  const groupForZone =
    groupsWithHealth.find((group) => group.id === addingZoneToGroupId) ??
    selectedGroup;
  const effectiveUserGroupId =
    groups.find((group) => group.id === userGroupId)?.id ??
    selectedGroup?.id ??
    "";
  const selectableOffers = offers.filter(
    (offer) =>
      offer.groupId === selectedGroup?.id &&
      offer.active &&
      offer.groupActive &&
      offer.profileActive,
  );
  const userCreationOffers = offers.filter(
    (offer) =>
      offer.groupId === effectiveUserGroupId &&
      offer.active &&
      offer.groupActive &&
      offer.profileActive,
  );
  const selectedOffers = offers.filter(
    (offer) => offer.groupId === (selectedGroup?.id ?? selectedGroupId),
  );
  const visibleNamedUsers = namedUsers.filter((user) => {
    const query = accountSearch.trim().toLocaleLowerCase("fr-FR");
    if (!query) return true;
    return [user.username, user.groupName, user.profileName, user.note].some(
      (value) => value?.toLocaleLowerCase("fr-FR").includes(query),
    );
  });

  function selectGroup(groupId: string, view: View = "groups") {
    setSelectedGroupId(groupId);
    setActiveView(view);
    setDrawer(null);
  }

  function openDrawer(nextDrawer: Exclude<Drawer, null>, groupId?: string) {
    if (groupId) setSelectedGroupId(groupId);
    if (nextDrawer === "zone")
      setAddingZoneToGroupId(groupId ?? selectedGroupId);
    setDrawer(nextDrawer);
  }

  const navItems: { id: View; label: string; count?: number }[] = [
    { id: "groups", label: "Organiser les zones", count: groups.length },
    {
      id: "catalogue",
      label: "Définir les forfaits",
      count: profiles.length + offers.length,
    },
    { id: "accounts", label: "Gérer les comptes", count: namedUsers.length },
  ];

  return (
    <div className="animate-fade-in-up pb-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            Roaming
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-soft">
            Organisez vos zones, définissez vos forfaits, puis attribuez les
            accès. Chaque groupe partage les mêmes comptes sur ses zones Wi-Fi.
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

      <nav
        aria-label="Étapes de gestion roaming"
        className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        {navItems.map((item, index) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setActiveView(item.id);
              setDrawer(null);
            }}
            aria-current={activeView === item.id ? "step" : undefined}
            className={`flex min-h-20 items-center gap-3 rounded-xl border p-4 text-left transition-colors ${activeView === item.id ? "border-brand-deep bg-clay text-ink" : "border-line bg-paper text-ink-soft hover:bg-clay/50"}`}
          >
            <span
              aria-hidden="true"
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${activeView === item.id ? "bg-brand-deep text-paper" : "bg-clay text-ink-soft"}`}
            >
              {index + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{item.label}</span>
              <span className="mt-0.5 block text-xs text-ink-soft">
                {item.count ?? 0}{" "}
                {item.id === "groups"
                  ? "groupe(s)"
                  : item.id === "catalogue"
                    ? "profil(s) et offre(s)"
                    : "compte(s)"}
              </span>
            </span>
          </button>
        ))}
      </nav>

      {activeView === "groups" && (
        <section className="mt-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-ink">
                Vos réseaux Wi-Fi
              </h2>
              <p className="mt-1 text-sm text-ink-soft">
                Regroupez les zones qui partagent les mêmes accès.
              </p>
            </div>
            <button
              type="button"
              onClick={() => openDrawer("group")}
              className="btn btn-md btn-secondary inline-flex items-center gap-2"
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
              Nouveau groupe
            </button>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {groupsWithHealth.map((group) => (
              <article key={group.id} className={panelClass}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">
                      Groupe · {group.code}
                    </p>
                    <h3 className="mt-2 break-words text-xl font-semibold text-ink">
                      {group.name}
                    </h3>
                  </div>
                  <form action={groupToggleAction}>
                    <input type="hidden" name="groupId" value={group.id} />
                    <input
                      type="hidden"
                      name="active"
                      value={group.active ? "false" : "true"}
                    />
                    <button
                      disabled={groupTogglePending}
                      className={`btn btn-sm btn-outline ${group.active ? "text-ok" : "text-ink-soft"}`}
                    >
                      {group.active ? "Mettre en pause" : "Reprendre"}
                    </button>
                  </form>
                </div>
                <p
                  className={`mt-4 flex items-center gap-2 text-sm ${group.offlineRouters.length ? "text-warn" : "text-ok"}`}
                >
                  <MapPin aria-hidden="true" className="h-4 w-4" />
                  {group.onlineRouters.length}/{group.routers.length} zones en
                  ligne
                </p>
                <p className="mt-2 text-xs leading-5 text-ink-soft">
                  {group.routers.map((r) => r.name).join(" · ") ||
                    "Aucune zone"}{" "}
                  · {namedUsers.filter((u) => u.groupId === group.id).length}{" "}
                  compte(s)
                </p>
                <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
                  <button
                    type="button"
                    onClick={() => selectGroup(group.id)}
                    className="btn btn-sm btn-outline"
                  >
                    Gérer les zones
                  </button>
                  <RoamingManageActions entity={{ kind: "group", ...group }} />
                </div>
              </article>
            ))}
          </div>
          {groups.length === 0 && (
            <div className="rounded-xl border border-dashed border-line bg-paper px-5 py-10 text-center">
              <h3 className="font-semibold text-ink">
                Votre premier réseau commence ici
              </h3>
              <p className="mt-2 text-sm text-ink-soft">
                Créez un groupe, puis choisissez les MikroTik qui partageront
                les accès.
              </p>
              <button
                type="button"
                onClick={() => openDrawer("group")}
                className="btn btn-md btn-primary mt-5"
              >
                Créer mon premier groupe
              </button>
            </div>
          )}
          <Notice state={groupToggleState} />
          {selectedGroup && (
            <div className={panelClass}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-ink-soft">Couverture du groupe</p>
                  <h3 className="mt-1 text-lg font-semibold text-ink">
                    {selectedGroup.name}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => openDrawer("zone", selectedGroup.id)}
                  className="btn btn-sm btn-outline"
                >
                  Ajouter une zone
                </button>
              </div>
              <ul className="mt-4 divide-y divide-line-soft">
                {selectedGroup.routers.map((zone) => (
                  <li
                    key={zone.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div>
                      <p className="break-words text-sm font-medium text-ink">
                        {zone.name}
                      </p>
                      <span className="text-xs text-ink-soft">
                        <StatusDot status={zone.status} />
                      </span>
                    </div>
                    {confirmingZoneId === zone.id ? (
                      <form
                        action={zoneDropAction}
                        className="flex flex-wrap items-center gap-2"
                      >
                        <input
                          type="hidden"
                          name="groupId"
                          value={selectedGroup.id}
                        />
                        <input type="hidden" name="routerId" value={zone.id} />
                        <span className="text-xs text-err">
                          Retirer {zone.name} ?
                        </span>
                        <button
                          disabled={zoneDropPending}
                          className="btn btn-sm btn-destructive"
                        >
                          {zoneDropPending ? "Retrait…" : "Confirmer"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingZoneId(null)}
                          className="btn btn-sm btn-outline"
                        >
                          Annuler
                        </button>
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmingZoneId(zone.id)}
                        className="btn btn-sm btn-outline text-err"
                      >
                        Retirer la zone
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {confirmingZoneId && (
                <p className="mt-3 text-xs leading-5 text-ink-soft">
                  Les comptes du groupe seront d’abord retirés de cette zone. Le
                  retrait sera refusé si le routeur ne répond pas, ou si c’est
                  la dernière zone d’un groupe portant des comptes.
                </p>
              )}
              <Notice state={zoneDropState} />
              <div className="mt-5 border-t border-line pt-4">
                <button
                  type="button"
                  onClick={() => setActiveView("catalogue")}
                  className="btn btn-md btn-secondary"
                >
                  Continuer vers les forfaits →
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {activeView === "catalogue" && (
        <section className={`mt-5 ${panelClass}`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-ink">
                Vos forfaits roaming
              </h2>
              <p className="mt-1 text-sm text-ink-soft">
                Les profils sont communs ; les offres choisissent où et à quel
                prix ils sont émis.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => openDrawer("profile")}
                className="btn btn-md btn-outline inline-flex items-center gap-2"
              >
                <Plus className="h-4 w-4" /> Profil
              </button>
              <button
                type="button"
                onClick={() => openDrawer("offer")}
                className="btn btn-md btn-secondary inline-flex items-center gap-2"
              >
                <Plus className="h-4 w-4" /> Offre
              </button>
            </div>
          </div>
          <div className="mt-6 grid gap-5 xl:grid-cols-[0.88fr_1.12fr]">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-ink">Profils communs</h3>
                <Layers3 aria-hidden="true" className="h-4 w-4 text-ink-soft" />
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                {profiles.map((profile) => (
                  <article
                    key={profile.id}
                    className="rounded-xl border border-line p-4"
                  >
                    <div className="flex justify-between gap-3">
                      <div>
                        <h4 className="font-mono text-sm font-bold text-ink">
                          {profile.name}
                        </h4>
                        <p className="mt-1 text-xs text-ink-soft">
                          {duration(
                            profile.durationValue,
                            profile.durationUnit,
                          )}{" "}
                          · {profile.uploadMbps}M/{profile.downloadMbps}M
                        </p>
                      </div>
                      <strong className="text-sm text-ink">
                        {money(profile.defaultPriceCents)}
                      </strong>
                    </div>
                    <div className="mt-4 border-t border-line pt-4">
                      <RoamingManageActions
                        entity={{ kind: "profile", ...profile }}
                      />
                    </div>
                  </article>
                ))}
                {profiles.length === 0 && (
                  <p className="border border-dashed border-line-soft p-4 text-sm text-ink-soft">
                    Ajoutez votre premier profil de vitesse et de durée.
                  </p>
                )}
              </div>
            </div>
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-ink">Offres du groupe</h3>
                  <p className="mt-1 text-xs text-ink-soft">
                    Tarif catalogue ou ajustement local.
                  </p>
                </div>
                <select
                  value={selectedGroup?.id ?? ""}
                  onChange={(event) => setSelectedGroupId(event.target.value)}
                  className="field w-auto"
                >
                  {groupsWithHealth.length === 0 && (
                    <option value="">Aucun groupe</option>
                  )}
                  {groupsWithHealth.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-3 divide-y divide-line-soft border-y border-line-soft">
                {selectedOffers.map((offer) => (
                  <div
                    key={offer.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div>
                      <p className="font-medium text-ink">
                        {offer.profileName}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-soft">
                        {offer.priceOverrideCents === null
                          ? "Prix catalogue"
                          : "Tarif spécifique au groupe"}
                        {!offer.active && " · en pause"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <strong
                        className={
                          offer.active
                            ? "text-ink"
                            : "text-ink-soft line-through"
                        }
                      >
                        {money(offer.effectivePriceCents)}
                      </strong>
                      <form action={offerToggleAction}>
                        <input type="hidden" name="offerId" value={offer.id} />
                        <input
                          type="hidden"
                          name="active"
                          value={offer.active ? "false" : "true"}
                        />
                        <button
                          disabled={offerTogglePending}
                          className="btn btn-sm btn-outline"
                        >
                          {offer.active ? "Pause" : "Reprendre"}
                        </button>
                      </form>
                      <RoamingManageActions
                        entity={{
                          kind: "offer",
                          ...offer,
                          name: offer.profileName,
                        }}
                      />
                    </div>
                  </div>
                ))}
                {selectedGroup && selectedOffers.length === 0 && (
                  <p className="py-5 text-sm text-ink-soft">
                    Aucune offre pour ce groupe.
                  </p>
                )}
                {!selectedGroup && (
                  <p className="py-5 text-sm text-ink-soft">
                    Créez un groupe avant d’y activer une offre.
                  </p>
                )}
              </div>
            </div>
          </div>
          <Notice state={offerToggleState} />
          <div className="mt-5 border-t border-line pt-4">
            <button
              type="button"
              onClick={() => setActiveView("accounts")}
              className="btn btn-md btn-secondary"
            >
              Continuer vers les comptes →
            </button>
          </div>
        </section>
      )}

      {activeView === "accounts" && (
        <section className={`mt-5 ${panelClass}`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-ink">Comptes</h2>
              <p className="mt-1 text-sm text-ink-soft">
                Gérez les accès nominatifs sans exposer les mots de passe
                stockés sur les MikroTik.
              </p>
            </div>
            <button
              type="button"
              onClick={() => openDrawer("account")}
              className="btn btn-md btn-secondary inline-flex items-center gap-2"
            >
              <UserPlus className="h-4 w-4" /> Nouveau compte
            </button>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <p className={labelClass}>Comptes existants</p>
            <label className="sr-only" htmlFor="account-search">
              Rechercher un compte
            </label>
            <input
              id="account-search"
              value={accountSearch}
              onChange={(event) => setAccountSearch(event.target.value)}
              placeholder="Rechercher un compte…"
              className="field sm:w-64"
            />
          </div>
          <ul className="mt-2 divide-y divide-line-soft border-y border-line-soft">
            {visibleNamedUsers.map((user) => {
              const userOffers = offers.filter(
                (offer) =>
                  offer.groupId === user.groupId &&
                  offer.active &&
                  offer.groupActive &&
                  offer.profileActive,
              );
              return (
                <li key={user.id} className="py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-mono text-sm font-bold text-ink">
                        {user.username}
                      </p>
                      {roamingIssuanceIsLive(
                        user.status ?? "",
                        user.createdAt,
                      ) && (
                        <p className="mt-1 text-xs text-warn">
                          Création en cours sur les zones…
                        </p>
                      )}
                      {(user.status === "PROVISIONING_ERROR" ||
                        (user.status === "PROVISIONING" &&
                          !roamingIssuanceIsLive(
                            user.status,
                            user.createdAt,
                          ))) && (
                        <p className="mt-1 text-xs text-err">
                          Création interrompue : supprimez ce compte pour
                          reprendre sa révocation.
                        </p>
                      )}
                      <p className="mt-1 text-xs text-ink-soft">
                        {[user.groupName, user.profileName, user.note]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {revealed[user.id] ? (
                        <code className="rounded bg-clay px-2 py-1.5 font-mono text-xs text-ink">
                          {revealed[user.id]}
                        </code>
                      ) : (
                        <button
                          type="button"
                          onClick={async () => {
                            const response = await revealRoamingUserPassword(
                              user.id,
                            );
                            const shown =
                              ("password" in response
                                ? response.password
                                : response.error) ?? "indisponible";
                            setRevealed((previous) => ({
                              ...previous,
                              [user.id]: shown,
                            }));
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-ink-soft hover:bg-clay"
                        >
                          <Eye className="h-3.5 w-3.5" /> Mot de passe
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(editingId === user.id ? null : user.id);
                          setConfirmingId(null);
                          setReplacingDeviceId(null);
                          setRevealed((previous) => {
                            const next = { ...previous };
                            delete next[user.id];
                            return next;
                          });
                        }}
                        aria-expanded={editingId === user.id}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-clay"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Modifier
                      </button>
                      {confirmingId === user.id ? (
                        <form
                          action={deleteAction}
                          className="flex items-center gap-1.5"
                        >
                          <input
                            type="hidden"
                            name="voucherId"
                            value={user.id}
                          />
                          <button
                            disabled={deletePending}
                            className="btn btn-sm btn-destructive"
                          >
                            {deletePending ? "Suppression…" : "Confirmer"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmingId(null)}
                            className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-ink-soft"
                          >
                            Annuler
                          </button>
                        </form>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmingId(user.id);
                            setEditingId(null);
                            setReplacingDeviceId(null);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-err hover:bg-err-soft"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Supprimer
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 rounded-lg bg-clay/50 px-3 py-2 text-xs leading-5 text-ink-soft">
                    {user.device ? (
                      <>
                        <p>
                          <strong className="text-ink">
                            Appareil mémorisé
                          </strong>{" "}
                          ·{" "}
                          <code className="font-mono">
                            {user.device.macAddress}
                          </code>{" "}
                          · {user.device.syncedZones}/{user.device.totalZones}{" "}
                          zones synchronisées
                        </p>
                        {user.device.pendingZones.length > 0 && (
                          <p className="mt-1 text-warn">
                            À reprendre :{" "}
                            {user.device.pendingZones
                              .map((zone) => zone.name)
                              .join(", ")}
                          </p>
                        )}
                        <p className="mt-1">
                          Le code reste saisissable partout : si le téléphone
                          revient avec une autre adresse privée, la liaison suit
                          d’elle-même après une connexion réussie.
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <form
                            action={resyncAction}
                            onSubmit={() => setDeviceNoticeId(user.id)}
                          >
                            <input
                              type="hidden"
                              name="voucherId"
                              value={user.id}
                            />
                            <button
                              disabled={resyncPending}
                              className="btn btn-sm btn-outline"
                            >
                              {resyncPending
                                ? "Resynchronisation…"
                                : "Resynchroniser"}
                            </button>
                          </form>
                          {replacingDeviceId === user.id ? (
                            <form
                              action={replaceDeviceAction}
                              onSubmit={() => setDeviceNoticeId(user.id)}
                              className="flex flex-wrap items-center gap-1.5"
                            >
                              <input
                                type="hidden"
                                name="voucherId"
                                value={user.id}
                              />
                              <button
                                disabled={replaceDevicePending}
                                className="rounded-lg bg-warn px-2.5 py-1.5 text-xs font-bold text-white disabled:opacity-60"
                              >
                                {replaceDevicePending
                                  ? "Réinitialisation…"
                                  : "Confirmer le changement"}
                              </button>
                              <button
                                type="button"
                                onClick={() => setReplacingDeviceId(null)}
                                className="rounded-lg border border-line bg-paper px-2.5 py-1.5 text-xs font-semibold text-ink-soft"
                              >
                                Annuler
                              </button>
                            </form>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setReplacingDeviceId(user.id);
                                setConfirmingId(null);
                              }}
                              className="rounded-lg border border-line bg-paper px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-clay"
                            >
                              Changer d’appareil
                            </button>
                          )}
                        </div>
                        {replacingDeviceId === user.id && (
                          <p className="mt-2 text-ink">
                            Les sessions et cookies de l’ancien appareil seront
                            retirés de toutes les zones avant qu’un nouvel
                            appareil puisse être mémorisé.
                          </p>
                        )}
                      </>
                    ) : (
                      <p>
                        <strong className="text-ink">
                          Aucun appareil mémorisé.
                        </strong>{" "}
                        La première connexion réussie l’enregistrera pour toutes
                        les zones du groupe.
                      </p>
                    )}
                    {deviceNoticeId === user.id && (
                      <>
                        <Notice state={resyncState} />
                        <Notice state={replaceDeviceState} />
                      </>
                    )}
                  </div>
                  {confirmingId === user.id && (
                    <>
                      <p className="mt-3 rounded-lg bg-err-soft px-3 py-2 text-xs leading-5 text-err">
                        Le compte sera retiré de toutes les zones du groupe, la
                        session en cours sera coupée et l’appareil auto-connecté
                        associé sera retiré. Si une zone ne répond pas, le
                        compte reste dans la liste jusqu’à une révocation
                        complète.
                      </p>
                      <Notice state={deleteState} />
                    </>
                  )}
                  {editingId === user.id && (
                    <>
                      <form
                        action={editAction}
                        className="mt-3 rounded-lg bg-clay/50 p-3"
                      >
                        <input type="hidden" name="voucherId" value={user.id} />
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className={labelClass}>
                            Identifiant
                            <input
                              name="username"
                              defaultValue={user.username}
                              maxLength={32}
                              pattern={ROAMING_USERNAME_PATTERN}
                              title="Lettres, chiffres, point, tiret, souligné ou arobase — 2 à 32 caractères."
                              className={`${inputClass} font-mono`}
                            />
                          </label>
                          <label className={labelClass}>
                            Mot de passe{" "}
                            <span className="normal-case tracking-normal">
                              (vide = inchangé)
                            </span>
                            <input
                              name="password"
                              maxLength={64}
                              placeholder="inchangé"
                              autoComplete="off"
                              className={`${inputClass} font-mono`}
                            />
                          </label>
                        </div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <label className={labelClass}>
                            Offre{" "}
                            <span className="normal-case tracking-normal">
                              (vide = inchangée)
                            </span>
                            <select
                              name="offerId"
                              disabled={userOffers.length === 0}
                              className={inputClass}
                            >
                              <option value="">
                                Inchangée — {user.profileName ?? "—"}
                              </option>
                              {userOffers.map((offer) => (
                                <option key={offer.id} value={offer.id}>
                                  {offer.profileName} —{" "}
                                  {money(offer.effectivePriceCents)}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className={labelClass}>
                            Rôle ou note
                            <input
                              name="note"
                              defaultValue={user.note ?? ""}
                              maxLength={180}
                              className={inputClass}
                            />
                          </label>
                        </div>
                        <button
                          disabled={editPending}
                          className="btn btn-md btn-secondary mt-3"
                        >
                          {editPending ? "Modification…" : "Enregistrer"}
                        </button>
                        {userOffers.length === 0 && (
                          <p className="mt-2 text-xs text-ink-soft">
                            Aucune offre active n’est disponible pour le groupe
                            de ce compte.
                          </p>
                        )}
                      </form>
                      <Notice state={editState} />
                      {editState &&
                        "skipped" in editState &&
                        (editState.skipped?.length ?? 0) > 0 && (
                          <p className="mt-2 rounded-lg bg-warn-soft px-3 py-2 text-xs leading-5 text-ink-soft">
                            Zones non mises à jour :{" "}
                            <strong className="text-ink">
                              {editState.skipped?.join(", ")}
                            </strong>{" "}
                            — relancez quand elles seront revenues.
                          </p>
                        )}
                    </>
                  )}
                </li>
              );
            })}
            {visibleNamedUsers.length === 0 && (
              <li className="py-8 text-center text-sm text-ink-soft">
                {namedUsers.length
                  ? "Aucun compte ne correspond à la recherche."
                  : "Aucun compte nominatif pour l’instant."}
              </li>
            )}
          </ul>
          <p className="mt-3 text-xs leading-5 text-ink-soft">
            Le SaaS ne conserve pas les mots de passe : ils sont relus à la
            demande sur le MikroTik, qui reste la source de vérité.
          </p>
        </section>
      )}

      {drawer && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-ink/50 p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Panneau de gestion roaming"
        >
          <div className="flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-paper shadow-modal sm:rounded-2xl sm:border sm:border-line">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line-soft bg-paper p-5">
              <div>
                <h2 className="text-lg font-semibold text-ink">
                  {drawer === "tickets"
                    ? "Créer des accès"
                    : drawer === "zone"
                      ? "Ajouter une zone"
                      : drawer === "group"
                        ? "Nouveau groupe"
                        : drawer === "profile"
                          ? "Ajouter un profil"
                          : drawer === "offer"
                            ? "Activer une offre"
                            : "Nouveau compte"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setDrawer(null)}
                className="rounded-lg border border-line p-2 text-ink hover:bg-clay"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5">
              {drawer === "tickets" && (
                <form action={ticketAction}>
                  <p className="rounded-lg bg-clay/50 px-3 py-2 text-sm leading-6 text-ink-soft">
                    Vérifier avant création : les accès seront posés à
                    l’identique sur toutes les zones du groupe choisi.
                  </p>
                  <label className={`mt-5 ${labelClass}`}>
                    Groupe
                    <select
                      value={selectedGroup?.id ?? ""}
                      onChange={(event) =>
                        setSelectedGroupId(event.target.value)
                      }
                      className={inputClass}
                    >
                      {groupsWithHealth
                        .filter((group) => group.active)
                        .map((group) => (
                          <option key={group.id} value={group.id}>
                            {group.name} · {group.onlineRouters.length}/
                            {group.routers.length} en ligne
                          </option>
                        ))}
                    </select>
                  </label>
                  <input
                    type="hidden"
                    name="groupId"
                    value={selectedGroup?.id ?? ""}
                  />
                  <label className={`mt-3 ${labelClass}`}>
                    Offre
                    <select
                      name="offerId"
                      required
                      disabled={
                        !selectedGroup?.active || selectableOffers.length === 0
                      }
                      className={inputClass}
                    >
                      <option value="">
                        {selectableOffers.length
                          ? "Choisir un profil…"
                          : "Aucune offre active"}
                      </option>
                      {selectableOffers.map((offer) => (
                        <option key={offer.id} value={offer.id}>
                          {offer.profileName} —{" "}
                          {money(offer.effectivePriceCents)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <label className={labelClass}>
                      Quantité
                      <input
                        name="quantity"
                        type="number"
                        min="1"
                        max="200"
                        defaultValue="10"
                        required
                        className={inputClass}
                      />
                    </label>
                    <label className={labelClass}>
                      Préfixe
                      <input
                        name="prefix"
                        maxLength={10}
                        placeholder="ex : nord"
                        className={inputClass}
                      />
                    </label>
                    <label className={labelClass}>
                      Note
                      <input
                        name="note"
                        maxLength={180}
                        placeholder="lot juillet"
                        className={inputClass}
                      />
                    </label>
                  </div>
                  <button
                    disabled={ticketPending || selectableOffers.length === 0}
                    className="btn btn-md btn-primary mt-5"
                  >
                    {ticketPending ? "Provisionnement…" : "Créer les tickets"}
                  </button>
                  <Notice state={ticketState} />
                </form>
              )}
              {drawer === "zone" && (
                <form action={groupZoneAction}>
                  <input
                    type="hidden"
                    name="groupId"
                    value={groupForZone?.id ?? ""}
                  />
                  <p className="text-sm leading-6 text-ink-soft">
                    Les comptes déjà créés sont synchronisés vers chaque zone
                    ajoutée. Pour retirer une zone, passez par la couverture du
                    groupe : le retrait efface les comptes du MikroTik concerné
                    avant de le détacher.
                  </p>
                  <fieldset className="mt-5">
                    <legend className={labelClass}>
                      Nouvelles zones pour {groupForZone?.name ?? "ce groupe"}
                    </legend>
                    <div className="mt-2 grid max-h-72 gap-1 overflow-y-auto rounded-lg border border-line-soft p-2 sm:grid-cols-2">
                      {routers
                        .filter(
                          (router) =>
                            !groupForZone?.routers.some(
                              (member) => member.id === router.id,
                            ),
                        )
                        .map((router) => (
                          <label
                            key={router.id}
                            className="flex items-center gap-2 rounded px-2 py-2 text-sm text-ink hover:bg-clay"
                          >
                            <input
                              type="checkbox"
                              name="routerIds"
                              value={router.id}
                            />
                            {router.name}
                          </label>
                        ))}
                      {groupForZone &&
                        routers.every((router) =>
                          groupForZone.routers.some(
                            (member) => member.id === router.id,
                          ),
                        ) && (
                          <span className="px-2 py-2 text-sm text-ink-soft">
                            Tous vos MikroTik sont déjà dans ce groupe.
                          </span>
                        )}
                    </div>
                  </fieldset>
                  <button
                    disabled={groupZonePending || !groupForZone}
                    className="btn btn-md btn-secondary mt-5"
                  >
                    {groupZonePending
                      ? "Synchronisation…"
                      : "Ajouter les zones"}
                  </button>
                  <Notice state={groupZoneState} />
                </form>
              )}
              {drawer === "group" && (
                <form action={groupAction}>
                  <p className="text-sm text-ink-soft">
                    Un groupe définit les MikroTik qui recevront exactement les
                    mêmes accès roaming.
                  </p>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <label className={labelClass}>
                      Nom
                      <input
                        name="name"
                        required
                        placeholder="CIV roaming"
                        className={inputClass}
                      />
                    </label>
                    <label className={labelClass}>
                      Code{" "}
                      <span className="normal-case tracking-normal">
                        (optionnel)
                      </span>
                      <input
                        name="code"
                        placeholder="CIV-ROAMING"
                        className={inputClass}
                      />
                    </label>
                  </div>
                  <fieldset className="mt-4">
                    <legend className={labelClass}>MikroTik couverts</legend>
                    <div className="mt-2 grid max-h-72 gap-1 overflow-y-auto rounded-lg border border-line-soft p-2 sm:grid-cols-2">
                      {routers.map((router) => (
                        <label
                          key={router.id}
                          className="flex items-center gap-2 rounded px-2 py-2 text-sm text-ink hover:bg-clay"
                        >
                          <input
                            type="checkbox"
                            name="routerIds"
                            value={router.id}
                          />
                          {router.name}
                        </label>
                      ))}
                      {routers.length === 0 && (
                        <span className="px-2 py-2 text-sm text-ink-soft">
                          Aucun routeur disponible.
                        </span>
                      )}
                    </div>
                  </fieldset>
                  <button
                    disabled={groupPending || routers.length === 0}
                    className="btn btn-md btn-secondary mt-5"
                  >
                    {groupPending ? "Création…" : "Créer le groupe"}
                  </button>
                  <Notice state={groupState} />
                </form>
              )}
              {drawer === "profile" && (
                <form action={profileAction}>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <label className={labelClass}>
                      Durée
                      <input
                        name="durationValue"
                        type="number"
                        min="1"
                        defaultValue="5"
                        required={profileUnit !== "Unlimited"}
                        disabled={profileUnit === "Unlimited"}
                        className={`${inputClass} disabled:opacity-40`}
                      />
                    </label>
                    <label className={labelClass}>
                      Unité
                      <select
                        name="durationUnit"
                        value={profileUnit}
                        onChange={(event) => setProfileUnit(event.target.value)}
                        className={inputClass}
                      >
                        <option value="Minutes">Minutes</option>
                        <option value="Hours">Heures</option>
                        <option value="Days">Jours</option>
                        <option value="Weeks">Semaines</option>
                        <option value="Months">Mois</option>
                        <option value="Unlimited">Illimité</option>
                      </select>
                    </label>
                    <label className={labelClass}>
                      Montant (Mb/s)
                      <input
                        name="uploadMbps"
                        type="number"
                        min="1"
                        defaultValue="5"
                        required
                        className={inputClass}
                      />
                    </label>
                    <label className={labelClass}>
                      Descendant
                      <input
                        name="downloadMbps"
                        type="number"
                        min="1"
                        defaultValue="5"
                        required
                        className={inputClass}
                      />
                    </label>
                  </div>
                  <label className={`mt-4 ${labelClass}`}>
                    Tarif catalogue (FCFA)
                    <input
                      name="defaultPriceCents"
                      type="number"
                      min="0"
                      defaultValue="100"
                      required
                      className={inputClass}
                    />
                  </label>
                  {profileUnit === "Unlimited" && (
                    <p className="mt-4 rounded-lg bg-clay/50 px-3 py-2 text-xs leading-5 text-ink-soft">
                      Ce profil n’a pas d’expiration et est adapté aux
                      administrateurs ou techniciens.
                    </p>
                  )}
                  <button
                    disabled={profilePending}
                    className="btn btn-md btn-secondary mt-5"
                  >
                    {profilePending ? "Ajout…" : "Ajouter le profil"}
                  </button>
                  <Notice state={profileState} />
                </form>
              )}
              {drawer === "offer" && (
                <form action={offerAction}>
                  <label className={labelClass}>
                    Groupe
                    <select
                      name="groupId"
                      defaultValue={selectedGroup?.id ?? ""}
                      required
                      className={inputClass}
                    >
                      <option value="">Choisir…</option>
                      {groups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={`mt-4 ${labelClass}`}>
                    Profil
                    <select name="profileId" required className={inputClass}>
                      <option value="">Choisir…</option>
                      {profiles.map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {profile.name} — {money(profile.defaultPriceCents)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={`mt-4 ${labelClass}`}>
                    Tarif du groupe{" "}
                    <span className="normal-case tracking-normal">
                      (laisser vide = catalogue)
                    </span>
                    <input
                      name="priceOverrideCents"
                      inputMode="numeric"
                      placeholder="Ex : 300"
                      className={inputClass}
                    />
                  </label>
                  <button
                    disabled={
                      offerPending ||
                      groups.length === 0 ||
                      profiles.length === 0
                    }
                    className="btn btn-md btn-secondary mt-5"
                  >
                    {offerPending ? "Enregistrement…" : "Activer l’offre"}
                  </button>
                  <Notice state={offerState} />
                </form>
              )}
              {drawer === "account" && (
                <form action={userAction}>
                  <input
                    type="hidden"
                    name="groupId"
                    value={effectiveUserGroupId}
                  />
                  <p className="text-sm leading-6 text-ink-soft">
                    Le compte est posé sur toutes les zones du groupe. Son mot
                    de passe n’est pas stocké dans le SaaS.
                  </p>
                  <label className={`mt-5 ${labelClass}`}>
                    Groupe
                    <select
                      value={effectiveUserGroupId}
                      onChange={(event) => setUserGroupId(event.target.value)}
                      className={inputClass}
                    >
                      <option value="">Choisir…</option>
                      {groups
                        .filter((group) => group.active)
                        .map((group) => (
                          <option key={group.id} value={group.id}>
                            {group.name} · {group.routers.length} zone(s)
                          </option>
                        ))}
                    </select>
                  </label>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className={labelClass}>
                      Identifiant
                      <input
                        name="username"
                        required
                        maxLength={32}
                        pattern={ROAMING_USERNAME_PATTERN}
                        title="Lettres, chiffres, point, tiret, souligné ou arobase — 2 à 32 caractères."
                        placeholder="ex : aroune"
                        autoComplete="off"
                        className={`${inputClass} font-mono`}
                      />
                    </label>
                    <label className={labelClass}>
                      Mot de passe{" "}
                      <span className="normal-case tracking-normal">
                        (vide = identique)
                      </span>
                      <input
                        name="password"
                        maxLength={64}
                        placeholder="ex : aroune"
                        autoComplete="off"
                        className={`${inputClass} font-mono`}
                      />
                    </label>
                  </div>
                  <label className={`mt-3 ${labelClass}`}>
                    Offre
                    <select
                      name="offerId"
                      required
                      disabled={
                        !effectiveUserGroupId || userCreationOffers.length === 0
                      }
                      className={inputClass}
                    >
                      <option value="">
                        {userCreationOffers.length
                          ? "Choisir un profil…"
                          : "Aucune offre active pour ce groupe"}
                      </option>
                      {userCreationOffers.map((offer) => (
                        <option key={offer.id} value={offer.id}>
                          {offer.profileName} —{" "}
                          {money(offer.effectivePriceCents)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={`mt-3 ${labelClass}`}>
                    Rôle ou note
                    <input
                      name="note"
                      maxLength={180}
                      placeholder="ex : technicien zone nord"
                      className={inputClass}
                    />
                  </label>
                  <button
                    disabled={
                      userPending ||
                      !effectiveUserGroupId ||
                      userCreationOffers.length === 0
                    }
                    className="btn btn-md btn-secondary mt-5"
                  >
                    {userPending ? "Création…" : "Créer l’utilisateur"}
                  </button>
                  <Notice state={userState} />
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      <p className="mt-6 text-xs leading-5 text-ink-soft">
        Les accès sont valables dans les zones de leur groupe. Les tarifs modifiés s’appliquent uniquement aux nouvelles émissions.
      </p>
    </div>
  );
}
