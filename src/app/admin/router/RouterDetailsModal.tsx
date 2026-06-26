"use client";

import { useEffect, useState } from "react";
import { Cpu, HardDrive, Loader2, MemoryStick, X } from "lucide-react";
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
    <div className="flex items-center justify-between gap-3 border-b border-slate-50 py-2 text-sm last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="rounded bg-slate-50 px-2.5 py-1 font-medium text-slate-700">
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
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        <Icon className="h-4 w-4 text-slate-400" />
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

  // Reset to "loading" the moment routerId changes — adjusted during render
  // (the React-recommended alternative to setState-in-effect) instead of as
  // the first statement of the fetch effect below.
  const [prevRouterId, setPrevRouterId] = useState(routerId);
  if (routerId !== prevRouterId) {
    setPrevRouterId(routerId);
    setState({ loading: true });
  }

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

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">
            {state.loading || !state.resources ? routerName : state.resources.identity}
          </h2>
          <button type="button" onClick={onClose}>
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-4">
          {state.loading && (
            <div className="flex flex-col items-center gap-2 py-8 text-sm text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin" />
              Lecture des informations en direct...
            </div>
          )}

          {!state.loading && state.error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{state.error}</p>
          )}

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
