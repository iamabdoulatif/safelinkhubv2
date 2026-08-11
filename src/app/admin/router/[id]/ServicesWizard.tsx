"use client";

/*
 * Wizard "Configurer les services" (onglet du détail routeur) :
 * 1. Sélection des interfaces (WAN + ports PPPoE + interfaces Hotspot)
 * 2. Configuration des services (réseau hotspot, bridge, anti-partage)
 * 3. Application & révision (récapitulatif, création des bridges via
 *    saveBridge, puis renvoi vers l'auto-setup complet).
 *
 * Le provisionnement lourd (DHCP, serveur hotspot, portail) reste porté
 * par l'auto-setup canonique — ce wizard prépare la topologie L2 exactement
 * comme le TopologyBuilder, avec l'ergonomie en 3 étapes de la référence.
 */

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Globe,
  Loader2,
  Network,
  Wifi,
} from "lucide-react";
import Link from "next/link";
import { listRouterInterfaces, saveBridge } from "@/lib/mikrotik/bridges";
import { HOTSPOT_BRIDGE_NAME } from "@/lib/mikrotik/constants";
import { CLASS_PREFIX_OPTIONS, getImpactNote } from "@/lib/net/subnet";

type Port = { name: string; type: string; running: boolean; disabled: boolean };

const GATEWAY_PRESETS = ["192.168.100.1", "10.0.0.1", "10.10.0.1", "10.200.5.1"];

function StatusDot({ port }: { port: Port }) {
  const color = port.disabled ? "bg-err" : port.running ? "bg-ok" : "bg-line-soft";
  const label = port.disabled ? "désactivée" : port.running ? "active" : "inactive";
  return (
    <span
      aria-hidden="true"
      title={label}
      className={`h-2 w-2 shrink-0 rounded-full ${color}`}
    />
  );
}

function Stepper({ current }: { current: 1 | 2 | 3 }) {
  const steps = [
    "Sélection des interfaces",
    "Configuration des services",
    "Application & révision",
  ] as const;
  return (
    <ol className="flex flex-wrap items-center gap-x-4 gap-y-2" aria-label="Étapes de configuration">
      {steps.map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3;
        const done = n < current;
        const active = n === current;
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              aria-current={active ? "step" : undefined}
              className={`flex h-7 w-7 items-center justify-center border-2 border-line font-display text-xs font-extrabold ${
                active
                  ? "bg-brand text-[#1C1917]"
                  : done
                    ? "bg-ink text-paper"
                    : "bg-paper text-ink-soft"
              }`}
            >
              {done ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : n}
            </span>
            <span
              className={`text-sm ${
                active ? "font-bold text-ink" : "font-medium text-ink-soft"
              }`}
            >
              {label}
            </span>
            {n < steps.length && (
              <span aria-hidden="true" className="hidden h-0.5 w-8 bg-line-soft sm:block" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function InterfaceCard({
  port,
  selected,
  disabled,
  mode,
  onToggle,
}: {
  port: Port;
  selected: boolean;
  disabled?: boolean;
  mode: "radio" | "checkbox";
  onToggle: () => void;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-3 border-2 p-3 transition-colors duration-150 ${
        selected
          ? "border-line bg-brand/15"
          : disabled
            ? "cursor-not-allowed border-line-soft bg-clay opacity-50"
            : "border-line-soft bg-paper hover:border-line hover:bg-clay"
      }`}
    >
      <input
        type={mode}
        checked={selected}
        disabled={disabled}
        onChange={onToggle}
        className="sr-only"
      />
      <span
        aria-hidden="true"
        className={`flex h-5 w-5 shrink-0 items-center justify-center border-2 border-line ${
          selected ? "bg-brand" : "bg-paper"
        }`}
      >
        {selected && <Check className="h-3.5 w-3.5 text-[#1C1917]" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-mono text-sm font-bold text-ink">{port.name}</span>
        <span className="block font-mono text-[11px] text-ink-soft">{port.type}</span>
      </span>
      <StatusDot port={port} />
    </label>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  description,
  icon: Icon,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description: string;
  icon: typeof Wifi;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 border-2 p-4 transition-colors duration-150 ${
        checked ? "border-line bg-brand/15" : "border-line-soft bg-paper hover:bg-clay"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border-2 border-line peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink ${
          checked ? "bg-brand" : "bg-paper"
        }`}
      >
        {checked && <Check className="h-3.5 w-3.5 text-[#1C1917]" />}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2 font-display text-sm font-bold text-ink">
          <Icon aria-hidden="true" className="h-4 w-4" />
          {label}
        </span>
        <span className="mt-0.5 block text-xs leading-5 text-ink-soft">{description}</span>
      </span>
    </label>
  );
}

export default function ServicesWizard({ routerId }: { routerId: string }) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [ports, setPorts] = useState<Port[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [wan, setWan] = useState<string | null>(null);
  const [pppoeEnabled, setPppoeEnabled] = useState(false);
  const [hotspotEnabled, setHotspotEnabled] = useState(true);
  const [pppoePorts, setPppoePorts] = useState<string[]>([]);
  const [hotspotPorts, setHotspotPorts] = useState<string[]>([]);

  const [bridgeName, setBridgeName] = useState(HOTSPOT_BRIDGE_NAME);
  const [gatewayIp, setGatewayIp] = useState("192.168.100.1");
  const [subnetBits, setSubnetBits] = useState(24);
  const [preventSharing, setPreventSharing] = useState(true);

  const [isApplying, startApply] = useTransition();
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applied, setApplied] = useState<{ bootstrapCommand?: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Incrémenté par "Réessayer"/"Reconfigurer" pour relancer la lecture des
  // interfaces ; l'effet ne fait que s'abonner au résultat asynchrone.
  const [reloadKey, setReloadKey] = useState(0);

  const loadPorts = useCallback(() => {
    setLoadError(null);
    setPorts(null);
    setReloadKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    listRouterInterfaces(routerId).then((res) => {
      if (cancelled) return;
      if (res.error) setLoadError(res.error);
      else {
        const list = (res.ports ?? []) as Port[];
        setPorts(list);
        // Pré-sélection raisonnable : ether1 = WAN (convention RouterOS).
        const ether1 = list.find((p) => p.name === "ether1");
        if (ether1) setWan(ether1.name);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [routerId, reloadKey]);

  const selectable = useMemo(
    () => (ports ?? []).filter((p) => p.name !== wan),
    [ports, wan],
  );

  const toggleIn = (list: string[], name: string) =>
    list.includes(name) ? list.filter((n) => n !== name) : [...list, name];

  const step1Valid =
    Boolean(wan) &&
    (!hotspotEnabled || hotspotPorts.length > 0) &&
    (!pppoeEnabled || pppoePorts.length > 0) &&
    (hotspotEnabled || pppoeEnabled);

  const gatewayValid = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(gatewayIp);

  function apply() {
    startApply(async () => {
      setApplyError(null);

      if (hotspotEnabled) {
        const fd = new FormData();
        fd.set("routerId", routerId);
        fd.set("name", bridgeName.trim() || HOTSPOT_BRIDGE_NAME);
        fd.set("gatewayIp", gatewayIp);
        fd.set("subnetBits", String(subnetBits));
        fd.set("hotspotEnabled", "on");
        if (preventSharing) fd.set("preventSharing", "on");
        for (const p of hotspotPorts) fd.append("ports", p);
        const res = await saveBridge(undefined, fd);
        if (res?.error) {
          setApplyError(res.error);
          return;
        }
        setApplied({ bootstrapCommand: res?.bootstrapCommand });
      }

      if (pppoeEnabled) {
        const fd = new FormData();
        fd.set("routerId", routerId);
        fd.set("name", "PPPOE-BRIDGE");
        fd.set("gatewayIp", "10.50.0.1");
        fd.set("subnetBits", "24");
        for (const p of pppoePorts) fd.append("ports", p);
        const res = await saveBridge(undefined, fd);
        if (res?.error) {
          setApplyError(res.error);
          return;
        }
        setApplied((prev) => prev ?? {});
      }

      router.refresh();
    });
  }

  if (loadError) {
    return (
      <div className="border-2 border-err bg-err-soft p-4">
        <p className="text-sm font-medium text-err">{loadError}</p>
        <button
          type="button"
          onClick={loadPorts}
          className="mt-3 border-2 border-line bg-paper px-3 py-1.5 text-sm font-bold text-ink hover:bg-clay"
        >
          Réessayer
        </button>
      </div>
    );
  }

  if (!ports) {
    return (
      <div className="flex flex-col items-center gap-2 border-2 border-line bg-paper py-10 text-sm text-ink-soft">
        <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />
        Lecture des interfaces du routeur...
      </div>
    );
  }

  if (applied) {
    return (
      <div className="border-2 border-line bg-paper p-5">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center border-2 border-line bg-brand">
            <Check aria-hidden="true" className="h-4 w-4 text-[#1C1917]" />
          </span>
          <h3 className="font-display text-lg font-bold text-ink">
            Topologie appliquée sur le routeur
          </h3>
        </div>
        <p className="mt-2 text-sm leading-6 text-ink-soft">
          Les bridges et adresses IP sont en place. Lancez maintenant
          l&apos;auto-setup complet pour provisionner DHCP, serveur hotspot et
          portail captif.
        </p>

        {applied.bootstrapCommand && (
          <div className="mt-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-widest text-ink-soft">
                Commande de bootstrap (terminal MikroTik)
              </p>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(applied.bootstrapCommand!).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1800);
                  });
                }}
                className="flex items-center gap-1.5 border-2 border-line bg-paper px-2.5 py-1 text-xs font-bold text-ink transition-colors duration-150 hover:bg-brand"
              >
                {copied ? (
                  <Check aria-hidden="true" className="h-3.5 w-3.5" />
                ) : (
                  <Copy aria-hidden="true" className="h-3.5 w-3.5" />
                )}
                {copied ? "Copié" : "Copier"}
              </button>
            </div>
            <pre className="code-block mt-2 p-3">{applied.bootstrapCommand}</pre>
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/admin/settings/router-setup"
            className="flex items-center gap-2 border-2 border-line bg-brand px-4 py-2 text-sm font-bold text-[#1C1917] transition-colors duration-150 hover:bg-ink hover:text-paper"
          >
            Lancer l&apos;auto-setup complet
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
          <button
            type="button"
            onClick={() => {
              setApplied(null);
              setStep(1);
              loadPorts();
            }}
            className="border-2 border-line bg-paper px-4 py-2 text-sm font-bold text-ink transition-colors duration-150 hover:bg-clay"
          >
            Reconfigurer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Stepper current={step} />

      {step === 1 && (
        <div className="animate-fade-in mt-6 space-y-6">
          <section>
            <h3 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wide text-ink">
              <Globe aria-hidden="true" className="h-4 w-4" />
              Interface WAN
              <span className="font-sans text-xs font-medium normal-case tracking-normal text-ink-soft">
                (liaison internet — ether1 recommandé)
              </span>
            </h3>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {ports.map((p) => (
                <InterfaceCard
                  key={p.name}
                  port={p}
                  mode="radio"
                  selected={wan === p.name}
                  onToggle={() => {
                    setWan(p.name);
                    setPppoePorts((prev) => prev.filter((n) => n !== p.name));
                    setHotspotPorts((prev) => prev.filter((n) => n !== p.name));
                  }}
                />
              ))}
            </div>
            <p className="mt-2 text-xs text-ink-soft">
              L&apos;interface WAN est exclue des sélections PPPoE et Hotspot pour ne
              jamais couper votre liaison montante.
            </p>
          </section>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Toggle
              checked={pppoeEnabled}
              onChange={setPppoeEnabled}
              icon={Network}
              label="Activer le serveur PPPoE"
              description="Accès filaire facturé pour clients résidentiels et bureaux."
            />
            <Toggle
              checked={hotspotEnabled}
              onChange={setHotspotEnabled}
              icon={Wifi}
              label="Activer Hotspot / Portail captif"
              description="Portail de connexion Wi-Fi pour vouchers et forfaits prépayés."
            />
          </div>

          {pppoeEnabled && (
            <section className="animate-fade-in">
              <h3 className="font-display text-sm font-bold uppercase tracking-wide text-ink">
                Ports LAN PPPoE
                <span className="ml-2 font-sans text-xs font-medium normal-case tracking-normal text-ink-soft">
                  (multi-sélection)
                </span>
              </h3>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {selectable.map((p) => (
                  <InterfaceCard
                    key={p.name}
                    port={p}
                    mode="checkbox"
                    selected={pppoePorts.includes(p.name)}
                    onToggle={() => setPppoePorts((prev) => toggleIn(prev, p.name))}
                  />
                ))}
              </div>
            </section>
          )}

          {hotspotEnabled && (
            <section className="animate-fade-in">
              <h3 className="font-display text-sm font-bold uppercase tracking-wide text-ink">
                Interfaces Hotspot
                <span className="ml-2 font-sans text-xs font-medium normal-case tracking-normal text-ink-soft">
                  (multi-sélection — toutes rejoignent le bridge hotspot)
                </span>
              </h3>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {selectable.map((p) => (
                  <InterfaceCard
                    key={p.name}
                    port={p}
                    mode="checkbox"
                    selected={hotspotPorts.includes(p.name)}
                    onToggle={() => setHotspotPorts((prev) => toggleIn(prev, p.name))}
                  />
                ))}
              </div>
            </section>
          )}

          <div className="flex justify-end border-t-2 border-line pt-4">
            <button
              type="button"
              disabled={!step1Valid}
              onClick={() => setStep(2)}
              title={
                step1Valid
                  ? undefined
                  : "Choisissez une interface WAN, activez au moins un service et assignez-lui des interfaces"
              }
              className="flex items-center gap-2 border-2 border-line bg-brand px-5 py-2.5 text-sm font-bold text-[#1C1917] transition-colors duration-150 hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:opacity-50"
            >
              Suivant : configurer les services
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="animate-fade-in mt-6 space-y-6">
          {hotspotEnabled && (
            <section className="border-2 border-line bg-paper p-4 sm:p-5">
              <h3 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wide text-ink">
                <Wifi aria-hidden="true" className="h-4 w-4" />
                Configuration Hotspot
              </h3>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="sw-bridge-name" className="block text-sm font-semibold text-ink">
                    Nom du bridge
                  </label>
                  <input
                    id="sw-bridge-name"
                    value={bridgeName}
                    onChange={(e) => setBridgeName(e.target.value)}
                    className="mt-1.5 w-full border-2 border-line bg-paper px-3 py-2 font-mono text-sm text-ink focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                  />
                </div>
                <div>
                  <label htmlFor="sw-gateway" className="block text-sm font-semibold text-ink">
                    IP de la passerelle
                  </label>
                  <input
                    id="sw-gateway"
                    value={gatewayIp}
                    onChange={(e) => setGatewayIp(e.target.value)}
                    aria-invalid={!gatewayValid}
                    className={`mt-1.5 w-full border-2 bg-paper px-3 py-2 font-mono text-sm text-ink focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
                      gatewayValid ? "border-line" : "border-err"
                    }`}
                  />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {GATEWAY_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setGatewayIp(preset)}
                        className={`border px-2 py-0.5 font-mono text-[11px] font-semibold transition-colors duration-150 ${
                          gatewayIp === preset
                            ? "border-line bg-brand text-[#1C1917]"
                            : "border-line-soft bg-paper text-ink-soft hover:bg-clay"
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label htmlFor="sw-subnet" className="block text-sm font-semibold text-ink">
                    Taille du réseau (CIDR)
                  </label>
                  <select
                    id="sw-subnet"
                    value={subnetBits}
                    onChange={(e) => setSubnetBits(Number(e.target.value))}
                    className="mt-1.5 w-full border-2 border-line bg-paper px-3 py-2 font-mono text-sm text-ink focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                  >
                    {/* Liste PARTAGÉE (lib/net/subnet), pas une copie locale :
                        celle-ci s'arrêtait à /19 alors que le helper couvre /8
                        à /24 depuis toujours et que container-setup annonce
                        « e.g. 8, 19, 23, 24 ». Le Topology Builder, lui, lisait
                        déjà la liste partagée — les deux écrans avaient donc
                        divergé. Ordre décroissant pour garder /24, le cas
                        courant, en tête. */}
                    {[...CLASS_PREFIX_OPTIONS.any].reverse().map((bits) => (
                      <option key={bits} value={bits}>
                        /{bits} — {(Math.pow(2, 32 - bits) - 2).toLocaleString("fr-FR")} adresses
                      </option>
                    ))}
                  </select>
                  {/* Un /8 réserve 16,7 millions d'adresses : le choix mérite
                      d'être expliqué au moment où on le fait, pas après. */}
                  <p className="mt-1.5 text-xs leading-5 text-ink-soft">{getImpactNote(subnetBits)}</p>
                </div>
                <div className="flex items-end">
                  <Toggle
                    checked={preventSharing}
                    onChange={setPreventSharing}
                    icon={Wifi}
                    label="Anti-partage de connexion"
                    description="Bloque le partage du voucher via TTL (un appareil par code)."
                  />
                </div>
              </div>
              <p className="mt-3 border-t border-line-soft pt-3 text-xs leading-5 text-ink-soft">
                Les interfaces assignées au Hotspot rejoignent le bridge{" "}
                <span className="font-mono font-semibold text-ink">{bridgeName || HOTSPOT_BRIDGE_NAME}</span>{" "}
                : tous les clients connectés passent par le portail captif.
              </p>
            </section>
          )}

          {pppoeEnabled && (
            <section className="border-2 border-line bg-paper p-4 sm:p-5">
              <h3 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wide text-ink">
                <Network aria-hidden="true" className="h-4 w-4" />
                Configuration PPPoE
              </h3>
              <p className="mt-2 text-sm leading-6 text-ink-soft">
                Les ports sélectionnés ({pppoePorts.map((p) => p).join(", ") || "—"})
                sont regroupés dans un bridge dédié{" "}
                <span className="font-mono font-semibold text-ink">PPPOE-BRIDGE</span> en
                10.50.0.1/24. Le serveur PPPoE et les profils clients seront
                provisionnés par l&apos;auto-setup.
              </p>
            </section>
          )}

          <div className="flex flex-wrap justify-between gap-3 border-t-2 border-line pt-4">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="flex items-center gap-2 border-2 border-line bg-paper px-4 py-2.5 text-sm font-bold text-ink transition-colors duration-150 hover:bg-clay"
            >
              <ArrowLeft aria-hidden="true" className="h-4 w-4" />
              Retour
            </button>
            <button
              type="button"
              disabled={hotspotEnabled && !gatewayValid}
              onClick={() => setStep(3)}
              className="flex items-center gap-2 border-2 border-line bg-brand px-5 py-2.5 text-sm font-bold text-[#1C1917] transition-colors duration-150 hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:opacity-50"
            >
              Suivant : révision
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="animate-fade-in mt-6 space-y-6">
          <section className="border-2 border-line bg-paper">
            <h3 className="border-b-2 border-line bg-clay px-4 py-2.5 font-display text-sm font-bold uppercase tracking-wide text-ink">
              Récapitulatif
            </h3>
            <dl className="divide-y divide-line-soft px-4 text-sm">
              <div className="flex items-center justify-between gap-3 py-2.5">
                <dt className="text-ink-soft">Interface WAN</dt>
                <dd className="font-mono font-semibold text-ink">{wan}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-2.5">
                <dt className="text-ink-soft">Hotspot / Portail captif</dt>
                <dd className="font-semibold text-ink">
                  {hotspotEnabled ? (
                    <>
                      <span className="font-mono">{hotspotPorts.join(", ")}</span>
                      <span className="ml-2 bg-brand px-1.5 py-0.5 font-mono text-[11px] font-bold text-[#1C1917]">
                        {gatewayIp}/{subnetBits}
                      </span>
                    </>
                  ) : (
                    "Désactivé"
                  )}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-2.5">
                <dt className="text-ink-soft">Serveur PPPoE</dt>
                <dd className="font-semibold text-ink">
                  {pppoeEnabled ? (
                    <span className="font-mono">{pppoePorts.join(", ")}</span>
                  ) : (
                    "Désactivé"
                  )}
                </dd>
              </div>
              {hotspotEnabled && (
                <div className="flex items-center justify-between gap-3 py-2.5">
                  <dt className="text-ink-soft">Anti-partage (TTL)</dt>
                  <dd className="font-semibold text-ink">{preventSharing ? "Activé" : "Désactivé"}</dd>
                </div>
              )}
            </dl>
          </section>

          <p className="border-2 border-line bg-clay px-4 py-3 text-xs leading-5 text-ink">
            L&apos;application crée les bridges, y attache les interfaces et pose
            les adresses IP sur le routeur — sans toucher au WAN. Le
            provisionnement complet (DHCP, serveur hotspot, portail) se lance
            ensuite depuis l&apos;auto-setup.
          </p>

          {applyError && (
            <p role="alert" className="border-2 border-err bg-err-soft px-3 py-2.5 text-sm font-medium text-err">
              {applyError}
            </p>
          )}

          <div className="flex flex-wrap justify-between gap-3 border-t-2 border-line pt-4">
            <button
              type="button"
              disabled={isApplying}
              onClick={() => setStep(2)}
              className="flex items-center gap-2 border-2 border-line bg-paper px-4 py-2.5 text-sm font-bold text-ink transition-colors duration-150 hover:bg-clay disabled:opacity-50"
            >
              <ArrowLeft aria-hidden="true" className="h-4 w-4" />
              Retour
            </button>
            <button
              type="button"
              disabled={isApplying}
              onClick={apply}
              className="flex items-center gap-2 border-2 border-line bg-brand px-5 py-2.5 text-sm font-bold text-[#1C1917] transition-colors duration-150 hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isApplying ? (
                <>
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                  Application en cours...
                </>
              ) : (
                <>
                  Appliquer la configuration
                  <Check aria-hidden="true" className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
