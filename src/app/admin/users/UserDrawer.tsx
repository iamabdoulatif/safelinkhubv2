"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Copy, Mail, Wifi, X } from "lucide-react";
import VpnQuotaForm, { type QuotaRouter } from "./VpnQuotaForm";
import type { UserControlRow } from "./users-control-center";
import { userMonogram } from "./users-register";
import { expiryHint } from "./user-expiry";

/**
 * Tiroir de détail d'un utilisateur.
 *
 * POURQUOI IL EXISTE. La liste portait, SUR CHAQUE LIGNE, un sélecteur de
 * quota, un bouton « Appliquer », trois boutons d'action et la même phrase
 * d'avertissement recopiée — « Les passes promotionnels sont gratuits et ne
 * débitent jamais Safecoin » — autant de fois qu'il y avait d'utilisateurs.
 * Une ligne faisait quatre étages ; on voyait quatre personnes par écran au
 * lieu de vingt, et l'avertissement, répété, ne se lisait plus.
 *
 * Une liste sert à TROUVER, un tiroir sert à AGIR. Tout ce qui agit vit donc
 * ici, pour un seul utilisateur à la fois, et l'avertissement s'y écrit une
 * fois — à l'endroit exact où l'on s'apprête à donner un accès.
 */
export default function UserDrawer({
  row,
  superadmin,
  routers,
  copied,
  onCopyEmail,
  onClose,
}: {
  row: UserControlRow;
  superadmin: boolean;
  /* Routeurs de l'organisation de cet utilisateur — portée possible du quota. */
  routers: QuotaRouter[];
  copied: boolean;
  onCopyEmail: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", surTouche);
    const overflowInitial = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", surTouche);
      document.body.style.overflow = overflowInitial;
    };
  }, [onClose]);

  const fin = expiryHint(row.quotaExpiresAt);
  const dateFin = row.quotaExpiresAt
    ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date(row.quotaExpiresAt))
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end sm:items-stretch">
      {/* Voile : referme au clic dehors, et fait reculer la liste au lieu de la
          laisser rivaliser avec le tiroir. */}
      <button
        type="button"
        aria-label="Fermer le détail"
        onClick={onClose}
        className="absolute inset-0 bg-ink/25"
      />

      {/* Feuille par le bas sur téléphone, tiroir par la droite au-delà : le
          pouce atteint le bas d'un écran, pas son bord droit. */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Détail de ${row.name}`}
        className="relative flex max-h-[88vh] w-full flex-col overflow-y-auto rounded-t-2xl border border-line bg-paper sm:max-h-none sm:h-full sm:w-[26rem] sm:rounded-none sm:rounded-l-2xl sm:border-y-0 sm:border-r-0"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-line-soft bg-paper px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <span
              aria-hidden="true"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-clay text-sm font-bold text-ink"
            >
              {userMonogram(row.name)}
            </span>
            <div className="min-w-0">
              <p className="truncate font-display text-lg font-bold text-ink">{row.name}</p>
              <p className="truncate text-sm text-ink-soft">{row.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-clay hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-6 px-5 py-5">
          <dl className="space-y-2.5 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-soft">Organisation</dt>
              <dd className="min-w-0 truncate text-right font-medium text-ink">{row.orgName}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-soft">Rôle</dt>
              <dd className="font-medium text-ink">
                {row.role === "superadmin" ? "Superadmin" : row.role === "admin" ? "Admin" : row.role}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-soft">Accès</dt>
              <dd className="text-right font-medium text-ink">
                {row.quotaLabel}
                {/* La date exacte n'apparaît QUE là où l'on peut la recopier. */}
                {dateFin && <span className="mt-0.5 block text-xs font-normal text-ink-soft">{dateFin}{fin.label ? ` · ${fin.label}` : ""}</span>}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-soft">Inscrit le</dt>
              <dd className="font-medium text-ink">
                {new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date(row.createdAt))}
              </dd>
            </div>
          </dl>

          <div className="flex flex-wrap gap-2 border-t border-line-soft pt-5">
            <button
              type="button"
              onClick={onCopyEmail}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-line bg-paper px-3 text-sm font-medium text-ink hover:bg-clay"
            >
              {copied ? <Check className="h-4 w-4 text-ok" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copié" : "Copier l'e-mail"}
            </button>
            <a
              href={`mailto:${row.email}`}
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-line bg-paper px-3 text-sm font-medium text-ink hover:bg-clay"
            >
              <Mail className="h-4 w-4" />
              Écrire
            </a>
          </div>

          {superadmin && (
            <section className="border-t border-line-soft pt-5">
              <h3 className="font-display text-sm font-bold text-ink">Accès VPN</h3>
              {/* L'avertissement, UNE fois, ici : à l'endroit précis où l'on
                  s'apprête à donner un accès. Répété sur chaque ligne de la
                  liste, il n'était plus lu par personne. */}
              <p className="mt-1 text-xs leading-5 text-ink-soft">
                Les passes promotionnels sont gratuits et ne débitent jamais Safecoin.
              </p>
              <div className="mt-3">
                <VpnQuotaForm userId={row.id} userEmail={row.email} routers={routers} />
              </div>
            </section>
          )}

          <section className="border-t border-line-soft pt-5">
            <h3 className="font-display text-sm font-bold text-ink">Ouvrir ailleurs</h3>
            <div className="mt-3 flex flex-col gap-2">
              {superadmin && (
                <Link
                  href="/admin/vpn-access"
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line bg-paper px-3 text-sm font-medium text-ink hover:bg-clay"
                >
                  <Wifi className="h-4 w-4" /> Accès VPN clients
                </Link>
              )}
              <Link
                href="/admin/remote-access"
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line bg-paper px-3 text-sm font-medium text-ink hover:bg-clay"
              >
                <ArrowUpRight className="h-4 w-4" /> Accès distant
              </Link>
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}
