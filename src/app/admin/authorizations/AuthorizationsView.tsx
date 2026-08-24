"use client";

// TEMPORAIRE — vue à onglets des demandes d'autorisation (Auto-Setup / Accès
// distant), avec boutons Valider / Refuser.
// TODO: Remplacer par système de paiement intégré.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Loader2 } from "lucide-react";
import {
  formatFcfa,
  mikrotikKindLabel,
  PAYMENT_METHODS,
} from "@/lib/billing/auto-setup-gate-config";
import { serviceLabel, periodLabel } from "@/lib/billing/remote-access-gate-config";
import { featureAccessLabel } from "@/lib/billing/feature-access-config";
import { decideAutoSetupAuthorization } from "@/lib/billing/auto-setup-authorization-actions";
import { decideRemoteAccessAuthorizationAction } from "@/lib/billing/remote-access-authorization-actions";
import { decideFeatureAccess } from "@/lib/billing/feature-access-actions";
import { decideSerialUnlock } from "@/lib/mikrotik/serial-unlock-actions";

type BaseRow = {
  id: string;
  requesterName: string;
  requesterEmail: string;
  routerName: string | null;
  amountFcfa: number;
  paymentMethod: string;
  proofUrl: string | null;
  status: string;
  createdAt: string | Date;
  decidedAt: string | Date | null;
};
type AutoSetupRow = BaseRow & { supportsContainers: boolean };
type RemoteAccessRow = BaseRow & { service: string; billingPeriod: string };
// Demandes d'accès génériques (router_link / remote_access) — sans paiement.
type FeatureAccessRow = {
  id: string;
  requesterName: string;
  requesterEmail: string;
  feature: string;
  note: string | null;
  status: string;
  createdAt: string | Date;
  decidedAt: string | Date | null;
};

// Demandes de déblocage d'un verrou de série MikroTik (support).
type SerialUnlockRow = {
  id: string;
  requesterName: string;
  requesterEmail: string;
  serialNumber: string;
  routerName: string | null;
  note: string | null;
  status: string;
  createdAt: string | Date;
  decidedAt: string | Date | null;
};

type Feature = "auto_setup" | "remote_access";
type Tab = Feature | "feature_access" | "serial_unlock";

function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pending: { label: "En attente", className: "bg-warn-soft text-warn" },
  approved: { label: "Validée", className: "bg-ok-soft text-ok" },
  rejected: { label: "Refusée", className: "bg-err-soft text-err" },
};

function methodLabel(id: string) {
  return PAYMENT_METHODS.find((m) => m.id === id)?.label ?? id;
}

function DecisionButtons({ id, feature }: { id: string; feature: Tab }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function decide(decision: "approved" | "rejected") {
    setError(null);
    startTransition(async () => {
      const res =
        feature === "auto_setup"
          ? await decideAutoSetupAuthorization(id, decision)
          : feature === "feature_access"
            ? await decideFeatureAccess(id, decision)
            : feature === "serial_unlock"
              ? await decideSerialUnlock(id, decision)
              : await decideRemoteAccessAuthorizationAction(id, decision);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => decide("approved")}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-md bg-ok px-2.5 py-1.5 text-xs font-medium text-white hover:bg-ink disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Valider
        </button>
        <button
          onClick={() => decide("rejected")}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-md border border-err px-2.5 py-1.5 text-xs font-medium text-err hover:bg-err-soft disabled:opacity-60"
        >
          <X className="h-3.5 w-3.5" />
          Refuser
        </button>
      </div>
      {error && <span className="text-[11px] text-err">{error}</span>}
    </div>
  );
}

function RequestCard({
  row,
  feature,
  details,
}: {
  row: BaseRow;
  feature: Feature;
  details: { label: string; value: string }[];
}) {
  const badge = STATUS_BADGE[row.status] ?? STATUS_BADGE.pending;
  return (
    <div className="rounded-xl border border-line-soft bg-paper p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-ink">{row.requesterName}</p>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.className}`}>
              {badge.label}
            </span>
          </div>
          <p className="truncate text-sm text-ink-soft">{row.requesterEmail}</p>
          <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm text-ink-soft sm:grid-cols-2">
            <span>
              Routeur : <span className="text-ink">{row.routerName ?? "—"}</span>
            </span>
            {details.map((d) => (
              <span key={d.label}>
                {d.label} : <span className="text-ink">{d.value}</span>
              </span>
            ))}
            <span>
              Montant déclaré :{" "}
              <span className="font-medium text-ink">{formatFcfa(row.amountFcfa)}</span>
            </span>
            <span>
              Moyen : <span className="text-ink">{methodLabel(row.paymentMethod)}</span>
            </span>
            <span>
              Demande : <span className="text-ink">{formatDate(row.createdAt)}</span>
            </span>
            {row.proofUrl && (
              <a
                href={row.proofUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-brand-deep underline"
              >
                Voir la preuve de paiement
              </a>
            )}
          </div>
          {row.status !== "pending" && row.decidedAt && (
            <p className="mt-2 text-[11px] text-ink-soft">
              {badge.label} le {formatDate(row.decidedAt)}
            </p>
          )}
        </div>
        {row.status === "pending" && <DecisionButtons id={row.id} feature={feature} />}
      </div>
    </div>
  );
}

/** Carte d'une demande d'accès générique (sans paiement). */
function FeatureAccessCard({ row }: { row: FeatureAccessRow }) {
  const badge = STATUS_BADGE[row.status] ?? STATUS_BADGE.pending;
  return (
    <div className="rounded-xl border border-line-soft bg-paper p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-ink">{row.requesterName}</p>
            <span className="rounded-full bg-clay px-2 py-0.5 text-[11px] font-medium text-ink">
              {featureAccessLabel(row.feature)}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.className}`}>
              {badge.label}
            </span>
          </div>
          <p className="truncate text-sm text-ink-soft">{row.requesterEmail}</p>
          {row.note && (
            <p className="mt-2 rounded-md bg-clay/50 px-3 py-2 text-sm text-ink">“{row.note}”</p>
          )}
          <p className="mt-2 text-sm text-ink-soft">
            Demande : <span className="text-ink">{formatDate(row.createdAt)}</span>
          </p>
          {row.status !== "pending" && row.decidedAt && (
            <p className="mt-1 text-[11px] text-ink-soft">
              {badge.label} le {formatDate(row.decidedAt)}
            </p>
          )}
        </div>
        {row.status === "pending" && <DecisionButtons id={row.id} feature="feature_access" />}
      </div>
    </div>
  );
}

/** Carte d'une demande de déblocage MikroTik (verrou de série). */
function SerialUnlockCard({ row }: { row: SerialUnlockRow }) {
  const badge = STATUS_BADGE[row.status] ?? STATUS_BADGE.pending;
  return (
    <div className="rounded-xl border border-line-soft bg-paper p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-ink">{row.requesterName}</p>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.className}`}>
              {badge.label}
            </span>
          </div>
          <p className="truncate text-sm text-ink-soft">{row.requesterEmail}</p>
          <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm text-ink-soft sm:grid-cols-2">
            <span>
              N° de série :{" "}
              <span className="font-mono font-medium text-ink">{row.serialNumber}</span>
            </span>
            <span>
              Routeur : <span className="text-ink">{row.routerName ?? "—"}</span>
            </span>
            <span>
              Demande : <span className="text-ink">{formatDate(row.createdAt)}</span>
            </span>
          </div>
          {row.note && (
            <p className="mt-2 rounded-md bg-clay/50 px-3 py-2 text-sm text-ink">“{row.note}”</p>
          )}
          <p className="mt-2 text-[11px] text-ink-soft">
            Valider libère le verrou : le demandeur pourra rattacher ce MikroTik à son compte.
          </p>
          {row.status !== "pending" && row.decidedAt && (
            <p className="mt-1 text-[11px] text-ink-soft">
              {badge.label} le {formatDate(row.decidedAt)}
            </p>
          )}
        </div>
        {row.status === "pending" && <DecisionButtons id={row.id} feature="serial_unlock" />}
      </div>
    </div>
  );
}

export default function AuthorizationsView({
  autoSetup,
  remoteAccess,
  featureAccess,
  serialUnlock,
}: {
  autoSetup: AutoSetupRow[];
  remoteAccess: RemoteAccessRow[];
  featureAccess: FeatureAccessRow[];
  serialUnlock: SerialUnlockRow[];
}) {
  const [tab, setTab] = useState<Tab>("feature_access");
  const autoPending = autoSetup.filter((r) => r.status === "pending").length;
  const remotePending = remoteAccess.filter((r) => r.status === "pending").length;
  const featurePending = featureAccess.filter((r) => r.status === "pending").length;
  const serialPending = serialUnlock.filter((r) => r.status === "pending").length;

  const isEmpty =
    tab === "auto_setup"
      ? autoSetup.length === 0
      : tab === "remote_access"
        ? remoteAccess.length === 0
        : tab === "serial_unlock"
          ? serialUnlock.length === 0
          : featureAccess.length === 0;

  return (
    <div className="animate-fade-in-up">
      <h1 className="text-2xl font-bold text-ink">Demandes d&apos;autorisation</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Validez ou refusez les demandes d&apos;accès (lier un MikroTik, tunnel d&apos;accès distant),
        les fonctionnalités payantes (Auto-Setup, accès direct) et les déblocages de MikroTik
        rattachés à un autre compte.
      </p>

      <div className="mt-5 flex flex-wrap gap-2 border-b border-line-soft">
        <TabButton
          active={tab === "feature_access"}
          onClick={() => setTab("feature_access")}
          label="Accès (Lier / Tunnel)"
          count={featurePending}
        />
        <TabButton
          active={tab === "auto_setup"}
          onClick={() => setTab("auto_setup")}
          label="Auto-Setup"
          count={autoPending}
        />
        <TabButton
          active={tab === "remote_access"}
          onClick={() => setTab("remote_access")}
          label="Accès direct (VPN)"
          count={remotePending}
        />
        <TabButton
          active={tab === "serial_unlock"}
          onClick={() => setTab("serial_unlock")}
          label="Déblocage MikroTik"
          count={serialPending}
        />
      </div>

      {isEmpty ? (
        <div className="mt-8 rounded-xl border border-line-soft bg-paper p-8 text-center text-sm text-ink-soft">
          Aucune demande pour le moment.
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {tab === "feature_access" &&
            featureAccess.map((r) => <FeatureAccessCard key={r.id} row={r} />)}
          {tab === "serial_unlock" &&
            serialUnlock.map((r) => <SerialUnlockCard key={r.id} row={r} />)}
          {tab === "auto_setup" &&
            autoSetup.map((r) => (
              <RequestCard
                key={r.id}
                row={r}
                feature="auto_setup"
                details={[{ label: "Type", value: mikrotikKindLabel(r.supportsContainers) }]}
              />
            ))}
          {tab === "remote_access" &&
            remoteAccess.map((r) => (
              <RequestCard
                key={r.id}
                row={r}
                feature="remote_access"
                details={[
                  { label: "Service", value: serviceLabel(r.service) },
                  { label: "Durée", value: periodLabel(r.billingPeriod) },
                ]}
              />
            ))}
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px flex items-center gap-2 border-b px-3 py-2 text-sm font-medium ${
        active
          ? "border-brand-deep text-ink"
          : "border-transparent text-ink-soft hover:text-ink"
      }`}
    >
      {label}
      {count > 0 && (
        <span className="rounded-full bg-warn-soft px-1.5 py-0.5 text-[10px] font-semibold text-warn">
          {count}
        </span>
      )}
    </button>
  );
}
