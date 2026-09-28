"use client";

import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Loader2, XCircle, type LucideIcon } from "lucide-react";

export type ActionMessage = { kind: "ok" | "warn" | "err"; text: string };

/**
 * Une rangée du menu « Plus d'actions ».
 *
 * Même gabarit pour les quatre outils : icône à gauche, titre + une phrase
 * de résumé, bouton « Lancer » à droite. Le mode d'emploi détaillé est replié
 * derrière « En savoir plus » : lisible au doigt et au clavier, mais il ne
 * noie plus le menu. Le compte rendu s'affiche sous la rangée, coloré selon
 * son issue et annoncé aux lecteurs d'écran (aria-live).
 */
export function FleetActionRow({
  icon: Icon,
  title,
  summary,
  help,
  helpLabel,
  runLabel,
  busyLabel,
  pending,
  onRun,
  message,
  children,
}: {
  icon: LucideIcon;
  title: string;
  summary: string;
  help?: string;
  helpLabel?: string;
  runLabel: string;
  busyLabel: string;
  pending: boolean;
  onRun: () => void;
  message: ActionMessage | null;
  /** Options à régler AVANT de lancer (cases à cocher…). */
  children?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-3.5">
      <span
        aria-hidden="true"
        className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line-soft bg-clay text-ink"
      >
        <Icon className="h-4 w-4" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-5 text-ink">{title}</p>
            <p className="mt-0.5 text-xs leading-5 text-ink-soft">{summary}</p>
          </div>
          <button
            type="button"
            onClick={onRun}
            disabled={pending}
            aria-label={`${runLabel} : ${title}`}
            className="btn btn-sm btn-outline shrink-0 whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending && <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />}
            {pending ? busyLabel : runLabel}
          </button>
        </div>

        {children && <div className="mt-3 space-y-2 rounded-lg bg-clay p-3">{children}</div>}

        {help && helpLabel && (
          <details className="group/help mt-2">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded text-xs font-semibold text-ink-soft underline-offset-2 hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden">
              {helpLabel}
              <span aria-hidden="true" className="transition-transform duration-150 group-open/help:rotate-90">›</span>
            </summary>
            <p className="mt-1.5 text-xs leading-5 text-ink-soft">{help}</p>
          </details>
        )}

        <div role="status" aria-live="polite">
          {message && <ActionFeedback message={message} />}
        </div>
      </div>
    </div>
  );
}

const FEEDBACK = {
  ok: { Icon: CheckCircle2, cls: "bg-ok-soft text-ok" },
  warn: { Icon: AlertTriangle, cls: "bg-warn-soft text-warn" },
  err: { Icon: XCircle, cls: "bg-err-soft text-err" },
} as const;

function ActionFeedback({ message }: { message: ActionMessage }) {
  const { Icon, cls } = FEEDBACK[message.kind];
  return (
    <p className={`mt-2 flex items-start gap-1.5 rounded-lg px-2.5 py-2 text-xs leading-5 ${cls}`}>
      <Icon aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 break-words">{message.text}</span>
    </p>
  );
}
