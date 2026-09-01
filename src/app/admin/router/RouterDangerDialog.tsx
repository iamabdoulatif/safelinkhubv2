"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, ShieldCheck, X } from "lucide-react";
import {
  consequenceDe,
  nomConfirme,
  type ActionDestructive,
} from "@/lib/mikrotik/action-destructive";

/**
 * Confirmation d'une action destructive sur un routeur.
 *
 * Elle vivait DANS LA CELLULE du tableau : « Réinitialiser ce processus de
 * configuration ? » et deux boutons de douze pixels, au bout d'une ligne parmi
 * d'autres. Rien n'y disait ce que l'action détruit, ni sur quel routeur elle
 * portait — alors que l'une des deux envoie un `/system/reset-configuration`
 * qui efface l'appareil. Le résultat, lui, sortait en `alert()`.
 *
 * Le dialogue reprend la forme des autres du produit (voile sombre, panneau
 * arrondi, en-tête / corps / actions) pour ne pas introduire une troisième
 * grammaire de fenêtre.
 */
export default function RouterDangerDialog({
  action,
  routerName,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  action: ActionDestructive;
  routerName: string;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const c = consequenceDe(action, routerName);
  const [saisie, setSaisie] = useState("");
  const champ = useRef<HTMLInputElement>(null);
  const fermer = useRef<HTMLButtonElement>(null);

  /* Le focus entre dans le dialogue à l'ouverture : sans cela il reste sur la
     ligne du tableau, et une tabulation renvoie l'utilisateur derrière le
     voile, dans un contenu qu'il croit désactivé. */
  useEffect(() => {
    (c.exigeLeNom ? champ.current : fermer.current)?.focus();
  }, [c.exigeLeNom]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Échap ferme — sauf pendant l'exécution : la commande est déjà partie
      // vers le routeur, masquer le dialogue ne l'annulerait pas.
      if (e.key === "Escape" && !pending) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, pending]);

  const bloque = c.exigeLeNom && !nomConfirme(saisie, routerName);

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-[#12301D]/55 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="danger-titre"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !pending) onClose();
      }}
    >
      <div className="mx-auto my-6 w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-paper shadow-2xl">
        <header className="flex items-start gap-3 border-b border-line-soft px-5 py-4 sm:px-6">
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-err-soft text-err">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="danger-titre" className="text-base font-bold leading-snug text-ink">
              {c.titre}
            </h2>
            <p className="mt-1 text-sm leading-6 text-ink-soft">{c.resume}</p>
          </div>
          <button
            ref={fermer}
            type="button"
            onClick={onClose}
            disabled={pending}
            aria-label="Fermer"
            className="rounded-full p-1.5 text-ink-soft transition hover:bg-clay hover:text-ink disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="px-5 py-4 sm:px-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-err">
            Ce qui est détruit
          </p>
          <ul className="mt-2 space-y-1.5" role="list">
            {c.effets.map((e) => (
              <li key={e} className="grid grid-cols-[14px_1fr] gap-2.5 text-sm leading-6 text-ink">
                <span aria-hidden className="mt-2 h-1.5 w-1.5 rounded-full bg-err" />
                {e}
              </li>
            ))}
          </ul>

          <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.13em] text-ink-soft">
            Ce qui est conservé
          </p>
          <ul className="mt-2 space-y-1.5" role="list">
            {c.conserve.map((e) => (
              <li
                key={e}
                className="grid grid-cols-[14px_1fr] gap-2.5 text-sm leading-6 text-ink-soft"
              >
                <ShieldCheck aria-hidden className="mt-1 h-3.5 w-3.5 text-ok" />
                {e}
              </li>
            ))}
          </ul>

          {c.exigeLeNom && (
            <div className="mt-5 border-t border-line-soft pt-4">
              <label htmlFor="danger-nom" className="block text-sm font-medium text-ink">
                Recopiez <span className="font-mono font-bold">{routerName}</span> pour confirmer
              </label>
              <p className="mt-0.5 text-xs text-ink-soft">
                Rien ne rattrape cet effacement : aucune sauvegarde SafeLinkHub ne remonte une
                configuration RouterOS effacée.
              </p>
              <input
                ref={champ}
                id="danger-nom"
                value={saisie}
                onChange={(e) => setSaisie(e.target.value)}
                disabled={pending}
                autoComplete="off"
                spellCheck={false}
                className="mt-2 w-full rounded-md border border-line-soft px-3 py-2 font-mono text-sm text-ink outline-none focus:border-err"
              />
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="mt-4 rounded-md border border-err/30 bg-err/10 px-3 py-2 text-sm leading-6 text-err"
            >
              {error}
            </p>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line-soft bg-clay/50 px-5 py-3 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-full px-4 py-2 text-sm font-semibold text-ink-soft transition hover:text-ink disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending || bloque}
            className="inline-flex items-center gap-2 rounded-full bg-err px-4 py-2 text-sm font-bold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {c.bouton}
          </button>
        </footer>
      </div>
    </div>
  );
}
