"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Cpu, HardDrive, Loader2, MemoryStick, X } from "lucide-react";
import { getRouterResources, type RouterResources } from "@/lib/mikrotik/router-resources";

function bytesToMiB(raw: string) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw || "—";
  return `${(n / (1024 * 1024)).toFixed(1)} MiB`;
}

function hzToMHz(raw: string) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw || "—";
  return `${n} MHz`;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line-soft py-2 text-sm last:border-0">
      <span className="text-ink-soft">{label}</span>
      <span className="rounded bg-clay px-2.5 py-1 font-medium text-ink">
        {value || "—"}
      </span>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Cpu;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Icon className="h-4 w-4 text-ink-soft" />
        {title}
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

export default function RouterDetailsModal({
  routerId,
  routerName,
  onClose,
}: {
  routerId: string;
  routerName: string;
  onClose: () => void;
}) {
  const [state, setState] = useState<
    | { loading: true }
    | { loading: false; resources?: RouterResources; error?: string }
  >({ loading: true });

  const [prevRouterId, setPrevRouterId] = useState(routerId);
  if (routerId !== prevRouterId) {
    setPrevRouterId(routerId);
    setState({ loading: true });
  }

  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    getRouterResources(routerId).then((res) => {
      if (cancelled) return;
      if (res?.error) setState({ loading: false, error: res.error });
      else setState({ loading: false, resources: res?.resources });
    });
    return () => {
      cancelled = true;
    };
  }, [routerId]);

  // Focus the close button on open, then restore focus to whatever
  // triggered the modal (the "Détails" row button) when it unmounts —
  // otherwise keyboard/screen-reader focus is dropped to <body>.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    return () => {
      previouslyFocused?.focus?.();
    };
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        const active = document.activeElement;
        if (active instanceof HTMLSelectElement) return;
        onClose();
        return;
      }

      if (e.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40"
        aria-hidden="true"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      />
      <div
        ref={dialogRef}
        className="relative flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl bg-paper"
        role="dialog"
        aria-modal="true"
        aria-labelledby="router-details-title"
      >
        <div className="flex items-center justify-between border-b border-line-soft px-6 py-4">
          <h2 id="router-details-title" className="text-lg font-semibold text-ink">
            {state.loading || !state.resources ? routerName : state.resources.identity}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            className="rounded-md p-1 text-ink-soft hover:bg-clay hover:text-ink-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-4">
          {state.loading && (
            <div className="flex flex-col items-center gap-2 py-8 text-sm text-ink-soft">
              <Loader2 className="h-5 w-5 animate-spin" />
              Lecture des informations en direct...
            </div>
          )}

          <div aria-live="polite">
            {!state.loading && state.error && (
              <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
                <span className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {state.error}
                </span>
              </p>
            )}
          </div>

          {!state.loading && state.resources && (
            <div className="space-y-5">
              <Field label="Uptime" value={state.resources.uptime} />

              <Section icon={Cpu} title="Matériel">
                <Field label="Modèle" value={state.resources.boardName} />
                <Field label="Architecture" value={state.resources.architectureName} />
                <Field label="CPU" value={state.resources.cpu} />
                <Field label="Nombre de cœurs" value={state.resources.cpuCount} />
                <Field label="Fréquence CPU" value={hzToMHz(state.resources.cpuFrequency)} />
                <Field label="Charge CPU" value={`${state.resources.cpuLoad || "0"}%`} />
              </Section>

              <Section icon={MemoryStick} title="Mémoire">
                <Field label="Libre" value={bytesToMiB(state.resources.freeMemory)} />
                <Field label="Totale" value={bytesToMiB(state.resources.totalMemory)} />
              </Section>

              <Section icon={HardDrive} title="Stockage">
                <Field label="Espace libre" value={bytesToMiB(state.resources.freeHddSpace)} />
                <Field label="Espace total" value={bytesToMiB(state.resources.totalHddSpace)} />
                <Field
                  label="Écritures secteur (depuis reboot)"
                  value={state.resources.writeSectSinceReboot}
                />
                <Field label="Écritures secteur (total)" value={state.resources.writeSectTotal} />
                <Field label="Secteurs défectueux" value={`${state.resources.badBlocks || "0"}%`} />
              </Section>

              <Section icon={Cpu} title="Logiciel">
                <Field label="Version RouterOS" value={state.resources.version} />
                <Field label="Date de build" value={state.resources.buildTime} />
                <Field label="Logiciel d'usine" value={state.resources.factorySoftware} />
              </Section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
