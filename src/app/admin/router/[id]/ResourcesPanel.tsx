"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Cpu, HardDrive, Loader2, MemoryStick } from "lucide-react";
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
      <span className="bg-clay px-2.5 py-1 font-mono text-xs font-semibold text-ink">
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
    <section className="border border-line bg-paper p-4 rounded-xl">
      <div className="flex items-center gap-2">
        <Icon aria-hidden="true" className="h-4 w-4 text-ink-soft" />
        <h3 className="font-display text-sm font-bold uppercase tracking-wide text-ink">{title}</h3>
      </div>
      <div className="mt-2">{children}</div>
    </section>
  );
}

/** Lecture en direct des ressources RouterOS (onglet "Ressources" du
 * détail routeur) — même source que l'ancien modal, présentée en grille
 * éditoriale. */
export default function ResourcesPanel({ routerId }: { routerId: string }) {
  const [state, setState] = useState<
    | { loading: true }
    | { loading: false; resources?: RouterResources; error?: string }
  >({ loading: true });

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

  if (state.loading) {
    return (
      <div className="flex flex-col items-center gap-2 border border-line bg-paper py-10 text-sm text-ink-soft rounded-xl">
        <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />
        Lecture des informations en direct...
      </div>
    );
  }

  if (state.error) {
    return (
      <p
        role="alert"
        className="flex items-center gap-2 border border-err bg-err-soft px-3 py-2.5 text-sm font-medium text-err"
      >
        <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
        {state.error}
      </p>
    );
  }

  const r = state.resources;
  if (!r) return null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Section icon={Cpu} title="Matériel">
        <Field label="Identité" value={r.identity} />
        <Field label="Modèle" value={r.boardName} />
        <Field label="Architecture" value={r.architectureName} />
        <Field label="CPU" value={r.cpu} />
        <Field label="Nombre de cœurs" value={r.cpuCount} />
        <Field label="Fréquence CPU" value={hzToMHz(r.cpuFrequency)} />
        <Field label="Charge CPU" value={`${r.cpuLoad || "0"}%`} />
        <Field label="Uptime" value={r.uptime} />
      </Section>

      <div className="space-y-4">
        <Section icon={MemoryStick} title="Mémoire">
          <Field label="Libre" value={bytesToMiB(r.freeMemory)} />
          <Field label="Totale" value={bytesToMiB(r.totalMemory)} />
        </Section>

        <Section icon={HardDrive} title="Stockage">
          <Field label="Espace libre" value={bytesToMiB(r.freeHddSpace)} />
          <Field label="Espace total" value={bytesToMiB(r.totalHddSpace)} />
          <Field label="Secteurs défectueux" value={`${r.badBlocks || "0"}%`} />
        </Section>

        <Section icon={Cpu} title="Logiciel">
          <Field label="Version RouterOS" value={r.version} />
          <Field label="Date de build" value={r.buildTime} />
          <Field label="Logiciel d'usine" value={r.factorySoftware} />
        </Section>
      </div>
    </div>
  );
}
