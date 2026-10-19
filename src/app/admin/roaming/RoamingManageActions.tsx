"use client";

import { useActionState, useId, useRef, useState } from "react";
import { Pencil, Trash2, X } from "lucide-react";
import { deleteRoamingGroup, deleteRoamingOffer } from "@/lib/roaming/actions";
import {
  deleteRoamingProfile,
  updateRoamingGroup,
  updateRoamingOffer,
  updateRoamingProfile,
} from "@/lib/roaming/manage-actions";

type Entity =
  | { kind: "group"; id: string; name: string; code: string }
  | {
      kind: "profile";
      id: string;
      name: string;
      durationValue: number;
      durationUnit: string;
      uploadMbps: number;
      downloadMbps: number;
      defaultPriceCents: number;
    }
  | {
      kind: "offer";
      id: string;
      name: string;
      priceOverrideCents: number | null;
      defaultPriceCents: number;
    };
type Result =
  | { error?: string; success?: boolean; summary?: string }
  | undefined;

export default function RoamingManageActions({ entity }: { entity: Entity }) {
  const dialog = useRef<HTMLDialogElement>(null),
    title = useId();
  const [mode, setMode] = useState<"edit" | "delete">("edit"),
    [attempt, setAttempt] = useState(0);
  function open(next: "edit" | "delete") {
    setMode(next);
    setAttempt((n) => n + 1);
    dialog.current?.showModal();
  }
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => open("edit")}
          aria-label={`Modifier ${entity.name}`}
          className="btn btn-sm btn-outline inline-flex items-center gap-1.5"
        >
          <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
          Modifier
        </button>
        <button
          type="button"
          onClick={() => open("delete")}
          aria-label={`Supprimer ${entity.name}`}
          className="btn btn-sm btn-outline inline-flex items-center gap-1.5 text-err"
        >
          <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
          Supprimer
        </button>
      </div>
      <dialog
        ref={dialog}
        aria-labelledby={title}
        className="theme-slate m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-line bg-paper p-5 text-ink shadow-modal backdrop:bg-ink/50 sm:p-6"
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-ink-soft">
              {entity.kind === "group"
                ? "Groupe"
                : entity.kind === "profile"
                  ? "Profil de forfait"
                  : "Offre du groupe"}
            </p>
            <h2 id={title} className="mt-1 break-words text-xl font-semibold">
              {mode === "edit" ? "Modifier" : "Supprimer"} {entity.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            className="btn btn-sm btn-ghost"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <ManageForm
          key={`${mode}-${attempt}`}
          entity={entity}
          mode={mode}
          close={() => dialog.current?.close()}
        />
      </dialog>
    </>
  );
}

function ManageForm({
  entity,
  mode,
  close,
}: {
  entity: Entity;
  mode: "edit" | "delete";
  close: () => void;
}) {
  const [unit, setUnit] = useState(
    entity.kind === "profile" ? entity.durationUnit : "Hours",
  );
  const [state, action, pending] = useActionState<Result, FormData>(
    async (previous, form) => {
      if (mode === "delete") {
        if (entity.kind === "profile")
          return deleteRoamingProfile(previous, form);
        if (entity.kind === "group") {
          form.set("groupId", entity.id);
          return deleteRoamingGroup(previous, form);
        }
        form.set("offerId", entity.id);
        return deleteRoamingOffer(previous, form);
      }
      if (entity.kind === "group") return updateRoamingGroup(previous, form);
      if (entity.kind === "profile")
        return updateRoamingProfile(previous, form);
      return updateRoamingOffer(previous, form);
    },
    undefined,
  );
  const input = "field mt-1",
    label = "block text-xs font-medium text-ink-soft";
  if (state?.success)
    return (
      <div role="status">
        <p className="rounded-xl bg-ok-soft p-4 text-sm text-ok">
          {state.summary ??
            (mode === "delete"
              ? "Élément supprimé."
              : "Modifications enregistrées.")}
        </p>
        <button
          type="button"
          onClick={close}
          className="btn btn-md btn-secondary mt-5"
        >
          Terminer
        </button>
      </div>
    );
  return (
    <form action={action}>
      <input type="hidden" name="id" value={entity.id} />
      {mode === "delete" ? (
        <p className="rounded-xl bg-err-soft p-4 text-sm leading-6 text-err">
          {entity.kind === "group"
            ? "Le groupe et ses offres seront supprimés. Révoquez d’abord ses comptes nominatifs ; la suppression sera refusée s’il en reste. Les tickets déjà émis restent valables."
            : entity.kind === "profile"
              ? "Ce profil sera retiré du catalogue. La suppression sera refusée s’il est encore lié à une offre ou à des accès émis."
              : "Cette offre ne sera plus disponible pour les nouvelles émissions. Les comptes et tickets déjà émis conservent leurs accès."}
        </p>
      ) : entity.kind === "group" ? (
        <div>
          <label className={label}>
            Nom du groupe
            <input
              name="name"
              defaultValue={entity.name}
              maxLength={80}
              required
              className={input}
            />
          </label>
          <p className="mt-3 text-xs text-ink-soft">
            Code technique conservé : {entity.code}. Gérez les zones depuis la
            fiche du groupe.
          </p>
        </div>
      ) : entity.kind === "profile" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className={label}>
              Durée
              <input
                name="durationValue"
                type="number"
                min="1"
                defaultValue={entity.durationValue || 1}
                disabled={unit === "Unlimited"}
                required={unit !== "Unlimited"}
                className={input}
              />
            </label>
            <label className={label}>
              Unité
              <select
                name="durationUnit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className={input}
              >
                <option value="Minutes">Minutes</option>
                <option value="Hours">Heures</option>
                <option value="Days">Jours</option>
                <option value="Weeks">Semaines</option>
                <option value="Months">Mois</option>
                <option value="Unlimited">Illimité</option>
              </select>
            </label>
            <label className={label}>
              Montant (Mb/s)
              <input
                name="uploadMbps"
                type="number"
                min="1"
                max="100000"
                defaultValue={entity.uploadMbps}
                required
                className={input}
              />
            </label>
            <label className={label}>
              Descendant (Mb/s)
              <input
                name="downloadMbps"
                type="number"
                min="1"
                max="100000"
                defaultValue={entity.downloadMbps}
                required
                className={input}
              />
            </label>
          </div>
          <label className={label}>
            Tarif catalogue (FCFA)
            <input
              name="defaultPriceCents"
              type="number"
              min="0"
              max="2147483647"
              defaultValue={entity.defaultPriceCents}
              required
              className={input}
            />
          </label>
          <p className="text-xs leading-5 text-ink-soft">
            Le prix s’applique aux prochains accès. Pour changer la durée ou les
            débits, retirez les offres liées ; si des accès ont déjà été émis,
            créez un nouveau profil.
          </p>
        </div>
      ) : (
        <div>
          <label className={label}>
            Tarif du groupe (FCFA)
            <input
              name="priceOverrideCents"
              type="number"
              min="0"
              max="2147483647"
              defaultValue={entity.priceOverrideCents ?? ""}
              placeholder={`Catalogue : ${entity.defaultPriceCents} FCFA`}
              className={input}
            />
          </label>
          <p className="mt-3 text-xs text-ink-soft">
            Laisser vide reprend le tarif catalogue. Zéro signifie gratuit. Les
            prix déjà vendus restent inchangés.
          </p>
        </div>
      )}
      {state?.error && (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-err-soft p-3 text-sm text-err"
        >
          {state.error}
        </p>
      )}
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={close}
          disabled={pending}
          className="btn btn-md btn-outline"
        >
          Annuler
        </button>
        <button
          disabled={pending}
          className={`btn btn-md ${mode === "delete" ? "btn-destructive" : "btn-secondary"}`}
        >
          {pending
            ? "En cours…"
            : mode === "delete"
              ? "Confirmer la suppression"
              : "Enregistrer"}
        </button>
      </div>
    </form>
  );
}
