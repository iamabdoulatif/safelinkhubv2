"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { Box, Cable, Layers, Plus, SlidersHorizontal, Wifi, X } from "lucide-react";
import { listRouterInterfaces, saveBridge } from "@/lib/mikrotik/bridges";
import {
  classForPrefix,
  CLASS_DEFAULT_PREFIX,
  CLASS_PREFIX_OPTIONS,
  type NetworkClass,
} from "@/lib/net/subnet";
import BootstrapModal from "./BootstrapModal";
import ConfigAuditBanner from "./ConfigAuditBanner";

type Port = { name: string; type: string; running: boolean; disabled: boolean };
type SavedBridge = {
  id: string;
  name: string;
  gatewayIp: string;
  subnetBits: number;
  ports: string[];
  hotspotEnabled: boolean;
};
type Line = { key: string; x1: number; y1: number; x2: number; y2: number };

function isWifiInterface(port: Pick<Port, "name" | "type">) {
  return port.type === "wlan" || port.type === "wifi" || port.name.startsWith("wifi");
}

function isVethInterface(port: Pick<Port, "name" | "type">) {
  return port.type === "veth";
}

function interfaceLabel(port: Pick<Port, "name" | "type">) {
  if (port.name === "wifi1") return "wifi1 5GHz";
  if (port.name === "wifi2") return "wifi2 2GHz";
  return port.name;
}

function ToggleSwitch({
  name,
  defaultChecked,
  disabled,
}: {
  name: string;
  defaultChecked?: boolean;
  disabled?: boolean;
}) {
  return (
    <label
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
      }`}
    >
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        disabled={disabled}
        className="peer sr-only"
      />
      <span className="absolute inset-0 rounded-full bg-slate-200 transition-colors peer-checked:bg-slate-900" />
      <span className="absolute left-1 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
    </label>
  );
}

function ConnectionLines({ lines }: { lines: Line[] }) {
  if (lines.length === 0) return null;

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
    >
      <title>Lignes de connexion des interfaces</title>
      {lines.map((line) => (
        <path
          key={line.key}
          d={`M ${line.x1} ${line.y1} C ${line.x1} ${line.y1 + 60}, ${line.x2} ${line.y2 - 60}, ${line.x2} ${line.y2}`}
          fill="none"
          stroke="#34d399"
          strokeDasharray="5 5"
          strokeLinecap="round"
          strokeWidth="2"
        />
      ))}
    </svg>
  );
}

function BridgeNode({
  bridge,
  draft,
  onConfigure,
  onDrop,
  nodeRef,
}: {
  bridge: Pick<SavedBridge, "name" | "gatewayIp" | "subnetBits" | "ports" | "hotspotEnabled">;
  draft?: boolean;
  onConfigure: () => void;
  onDrop?: (e: React.DragEvent) => void;
  nodeRef: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div
      ref={nodeRef}
      onDoubleClick={onConfigure}
      onDragOver={(e) => onDrop && e.preventDefault()}
      onDrop={onDrop}
      className={`relative w-80 shrink-0 rounded-xl border bg-white p-5 shadow-md ${
        draft ? "border-emerald-300" : "border-emerald-200"
      }`}
    >
      <button
        type="button"
        onClick={onConfigure}
        className="absolute -top-3.5 left-1/2 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border border-emerald-200 bg-white text-emerald-600 shadow-sm hover:bg-emerald-50"
        title="Configurer le bridge"
      >
        <Plus className="h-4 w-4" />
      </button>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-emerald-500" />
          <p className="text-base font-semibold text-slate-700">
            {draft ? "SAFELINKHUB-BRIDGE" : bridge.name}
          </p>
        </div>
        <SlidersHorizontal className="h-4 w-4 text-slate-400" />
      </div>

      <div className="mt-6 flex items-center justify-between text-sm">
        <span className="text-slate-500">IP de la passerelle</span>
        <span className="rounded bg-slate-100 px-2.5 py-1.5 font-medium text-slate-600">
          {bridge.gatewayIp === "Not configured"
            ? "10.200.5.1/19"
            : `${bridge.gatewayIp}/${bridge.subnetBits}`}
        </span>
      </div>

      {bridge.ports.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {bridge.ports.map((p) => (
            <span
              key={p}
              className="rounded bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700"
            >
              {p}
            </span>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-md border-2 border-dashed border-emerald-200 bg-emerald-50/40 py-4 text-center text-xs font-medium text-emerald-600">
          Déposez une interface ici
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="rounded-full bg-emerald-500 px-2.5 py-1 text-[11px] font-semibold text-white">
          {bridge.hotspotEnabled ? "Hotspot" : "Pas de Hotspot"}
        </span>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
          Pas de PPPoE
        </span>
      </div>
    </div>
  );
}

function DockerBridgeNode({ ports, nodeRef }: { ports: string[]; nodeRef: (el: HTMLDivElement | null) => void }) {
  return (
    <div
      ref={nodeRef}
      className="relative w-64 shrink-0 rounded-xl border border-violet-200 bg-white p-5 shadow-md"
    >
      <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-violet-100 px-2.5 py-0.5 text-[10px] font-semibold text-violet-700">
        Géré automatiquement
      </span>

      <div className="mt-1 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-violet-500" />
          <p className="text-base font-semibold text-slate-700">DOCKERS</p>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between text-sm">
        <span className="text-slate-500">IP de la passerelle</span>
        <span className="rounded bg-slate-100 px-2.5 py-1.5 font-medium text-slate-600">
          11.11.11.1/28
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {ports.map((p) => (
          <span
            key={p}
            className="rounded bg-violet-50 px-2 py-1 text-[11px] font-medium text-violet-700"
          >
            {p}
          </span>
        ))}
      </div>

      <p className="mt-4 text-[11px] text-slate-400">
        Conteneur MikHmon — créé par l&apos;auto-setup, voir plus bas.
      </p>
    </div>
  );
}

function InterfaceTile({
  port,
  used,
  tileRef,
}: {
  port: Port;
  used: boolean;
  tileRef: (el: HTMLDivElement | null) => void;
}) {
  const isVeth = isVethInterface(port);
  const draggable = !used && !port.disabled && !isVeth;

  return (
    <div
      ref={tileRef}
      draggable={draggable}
      onDragStart={(e) => draggable && e.dataTransfer.setData("text/plain", port.name)}
      title={
        isVeth
          ? `${port.name} est l'interface du conteneur Docker (bridge DOCKERS)`
          : port.disabled
            ? `${port.name} est désactivé sur le routeur`
            : undefined
      }
      className={`relative flex h-16 w-[72px] shrink-0 flex-col items-center justify-center gap-1 rounded-lg border text-[11px] shadow-sm ${
        port.disabled
          ? "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300"
          : isVeth
            ? "cursor-not-allowed border-violet-200 bg-violet-50 text-violet-700"
            : used
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "cursor-grab border-slate-200 bg-white text-slate-500 hover:border-emerald-300 hover:text-slate-700"
      }`}
    >
      {port.name === "ether1" && (
        <span className="absolute -top-2 rounded bg-amber-100 px-1 py-0.5 text-[9px] font-semibold text-amber-700">
          WAN
        </span>
      )}
      {isVeth ? (
        <Box className="h-4 w-4 text-violet-500" />
      ) : isWifiInterface(port) ? (
        <Wifi className={`h-4 w-4 ${port.disabled ? "text-slate-300" : "text-emerald-300"}`} />
      ) : (
        <Cable className={`h-4 w-4 ${port.disabled ? "text-slate-300" : "text-emerald-500"}`} />
      )}
      <span className="max-w-full truncate px-1 leading-tight">{interfaceLabel(port)}</span>
    </div>
  );
}

function RouterDeviceCard({
  ports,
  assignedElsewhere,
  draftPorts,
  registerPortRef,
}: {
  ports: Port[] | null;
  assignedElsewhere: Set<string>;
  draftPorts: string[];
  registerPortRef: (name: string, el: HTMLDivElement | null) => void;
}) {
  return (
    <div className="absolute left-1/2 top-7 w-[min(98%,1100px)] -translate-x-1/2 rounded-xl border border-slate-200 bg-white/95 p-5 shadow-lg">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-900 text-sm font-bold text-white">
            M
          </span>
          <span className="rounded bg-slate-50 px-2.5 py-1.5 text-sm text-slate-500">
            hAP ax lite v7.19.4 (stable) • uptime 6m6s
          </span>
        </div>
        <span className="text-sm text-slate-400">
          Glissez un port pour le connecter à un bridge
        </span>
      </div>
      <div className="flex flex-nowrap items-start justify-center gap-3 overflow-x-auto pb-1">
        {ports === null && (
          <span className="py-8 text-sm text-slate-400">Chargement des interfaces...</span>
        )}
        {ports?.map((port) => (
          <InterfaceTile
            key={port.name}
            port={port}
            used={assignedElsewhere.has(port.name) || draftPorts.includes(port.name)}
            tileRef={(el) => registerPortRef(port.name, el)}
          />
        ))}
      </div>
    </div>
  );
}

function TopologyZoomControls() {
  return (
    <div className="absolute bottom-4 left-4 overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
      {["+", "-", "□", "▣"].map((label) => (
        <button
          key={label}
          type="button"
          className="block h-10 w-10 border-b border-slate-100 text-base font-semibold text-slate-700 last:border-b-0 hover:bg-slate-50"
          title="Contrôle du canevas"
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function TopologyMiniMap() {
  return (
    <div className="absolute bottom-4 right-4 h-32 w-44 rounded-sm border border-slate-100 bg-white/90 p-4 shadow-sm">
      <div className="mt-9 h-6 w-32 rounded bg-slate-200" />
    </div>
  );
}

function TopologyCanvas({
  ports,
  initialBridges,
  assignedElsewhere,
  draftPorts,
  hasDraft,
  onAddBridge,
  onDrop,
  onConfigure,
}: {
  ports: Port[] | null;
  initialBridges: SavedBridge[];
  assignedElsewhere: Set<string>;
  draftPorts: string[];
  hasDraft: boolean;
  onAddBridge: () => void;
  onDrop: (e: React.DragEvent) => void;
  onConfigure: () => void;
}) {
  const visibleBridge = useMemo(
    () =>
      hasDraft
        ? {
            id: "draft",
            name: "SAFELINKHUB-BRIDGE",
            gatewayIp: "Not configured",
            subnetBits: 24,
            ports: draftPorts,
            hotspotEnabled: true,
          }
        : initialBridges[0] ?? null,
    [draftPorts, hasDraft, initialBridges],
  );

  const dockerPorts = useMemo(
    () => (ports ?? []).filter(isVethInterface).map((p) => p.name),
    [ports],
  );
  const hasDockerBridge = dockerPorts.length > 0;

  const sectionRef = useRef<HTMLDivElement | null>(null);
  const bridgeRef = useRef<HTMLDivElement | null>(null);
  const dockerBridgeRef = useRef<HTMLDivElement | null>(null);
  const portElsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const [lines, setLines] = useState<Line[]>([]);

  const registerPortRef = useCallback((name: string, el: HTMLDivElement | null) => {
    if (el) portElsRef.current.set(name, el);
    else portElsRef.current.delete(name);
  }, []);

  const recomputeLines = useCallback(() => {
    const section = sectionRef.current;
    if (!section) {
      setLines([]);
      return;
    }
    const sectionBox = section.getBoundingClientRect();
    const next: Line[] = [];

    const addLinesFor = (bridgeEl: HTMLDivElement | null, names: string[]) => {
      if (!bridgeEl) return;
      const bridgeBox = bridgeEl.getBoundingClientRect();
      const targetX = bridgeBox.left + bridgeBox.width / 2 - sectionBox.left;
      const targetY = bridgeBox.top - sectionBox.top;
      names.forEach((name) => {
        const el = portElsRef.current.get(name);
        if (!el) return;
        const box = el.getBoundingClientRect();
        next.push({
          key: name,
          x1: box.left + box.width / 2 - sectionBox.left,
          y1: box.bottom - sectionBox.top,
          x2: targetX,
          y2: targetY,
        });
      });
    };

    if (visibleBridge) addLinesFor(bridgeRef.current, visibleBridge.ports);
    if (hasDockerBridge) addLinesFor(dockerBridgeRef.current, dockerPorts);

    setLines(next);
  }, [dockerPorts, hasDockerBridge, visibleBridge]);

  useLayoutEffect(() => {
    recomputeLines();
  }, [recomputeLines, ports]);

  useEffect(() => {
    const onResize = () => recomputeLines();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [recomputeLines]);

  return (
    <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="grid min-h-[700px] grid-cols-1 md:grid-cols-[300px_1fr]">
        <aside className="border-b border-slate-200 bg-white p-6 md:border-b-0 md:border-r">
          <p className="text-sm font-medium text-emerald-600">
            Double-cliquez sur une ligne de connexion existante pour la
            supprimer.
          </p>
          <p className="mt-2 text-sm text-emerald-600">
            Double-cliquez sur un bridge pour le configurer.
          </p>
          <button
            type="button"
            onClick={onAddBridge}
            className="mt-6 w-full rounded-md bg-slate-950 px-4 py-3.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            + Ajouter un bridge
          </button>
        </aside>

        <section
          ref={sectionRef}
          className="relative min-h-[700px] overflow-hidden"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(148, 163, 184, 0.35) 1px, transparent 1px)",
            backgroundSize: "18px 18px",
          }}
        >
          <RouterDeviceCard
            ports={ports}
            assignedElsewhere={assignedElsewhere}
            draftPorts={draftPorts}
            registerPortRef={registerPortRef}
          />

          {visibleBridge || hasDockerBridge ? (
            <>
              <ConnectionLines lines={lines} />
              <div className="absolute left-1/2 top-[290px] flex -translate-x-1/2 items-start gap-6">
                {visibleBridge ? (
                  <BridgeNode
                    bridge={visibleBridge}
                    draft={visibleBridge.name === "SAFELINKHUB-BRIDGE"}
                    onConfigure={onConfigure}
                    onDrop={hasDraft ? onDrop : undefined}
                    nodeRef={(el) => {
                      bridgeRef.current = el;
                    }}
                  />
                ) : (
                  <div className="flex h-40 w-80 items-center justify-center rounded-xl border-2 border-dashed border-emerald-300 bg-white/80 text-sm font-medium text-emerald-700">
                    Cliquez sur &quot;Ajouter un bridge&quot; pour commencer
                  </div>
                )}
                {hasDockerBridge && (
                  <DockerBridgeNode
                    ports={dockerPorts}
                    nodeRef={(el) => {
                      dockerBridgeRef.current = el;
                    }}
                  />
                )}
              </div>
            </>
          ) : (
            <div className="absolute left-1/2 top-[290px] flex h-40 w-80 -translate-x-1/2 items-center justify-center rounded-xl border-2 border-dashed border-emerald-300 bg-white/80 text-sm font-medium text-emerald-700">
              Cliquez sur &quot;Ajouter un bridge&quot; pour commencer
            </div>
          )}

          <TopologyZoomControls />
          <TopologyMiniMap />
        </section>
      </div>
    </div>
  );
}

export default function TopologyBuilder({
  routerId,
  initialBridges,
}: {
  routerId: string;
  initialBridges: SavedBridge[];
}) {
  const router = useRouter();
  const [ports, setPorts] = useState<Port[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasDraft, setHasDraft] = useState(false);
  const [draftPorts, setDraftPorts] = useState<string[]>([]);
  const [configuring, setConfiguring] = useState(false);
  const [bootstrap, setBootstrap] = useState<{ bridgeId: string; command: string } | null>(null);
  const [state, formAction, pending] = useActionState(saveBridge, undefined);
  const [retryCount, setRetryCount] = useState(0);
  const [retrying, setRetrying] = useState(true);
  const [networkClass, setNetworkClass] = useState<NetworkClass>("B");
  const [subnetBits, setSubnetBits] = useState(19);
  const [gatewayIp, setGatewayIp] = useState("10.200.5.1");

  function changeNetworkClass(next: NetworkClass) {
    setNetworkClass(next);
    if (!CLASS_PREFIX_OPTIONS[next].includes(subnetBits)) {
      setSubnetBits(CLASS_DEFAULT_PREFIX[next]);
    }
  }

  // Pre-fills the modal from the bridge's actual saved values when
  // re-opening it to edit an existing bridge — previously this always
  // reset to the hardcoded 10.200.5.1/19 example regardless of what was
  // really configured, so edits never reflected the router's real state.
  function openConfigure() {
    const existing = initialBridges[0];
    if (existing && existing.gatewayIp !== "Not configured") {
      setGatewayIp(existing.gatewayIp);
      setSubnetBits(existing.subnetBits);
      setNetworkClass(classForPrefix(existing.subnetBits));
    } else {
      setGatewayIp("10.200.5.1");
      setSubnetBits(19);
      setNetworkClass("B");
    }
    setConfiguring(true);
  }

  // Flip back into "retrying" the moment routerId/retryCount changes —
  // adjusted during render (the React-recommended alternative to
  // setState-in-effect) instead of as the first statement of the fetch
  // effect below.
  const fetchKey = `${routerId}:${retryCount}`;
  const [prevFetchKey, setPrevFetchKey] = useState(fetchKey);
  if (fetchKey !== prevFetchKey) {
    setPrevFetchKey(fetchKey);
    setRetrying(true);
  }

  useEffect(() => {
    let cancelled = false;
    listRouterInterfaces(routerId).then((res) => {
      if (cancelled) return;
      setRetrying(false);
      if (res?.error) {
        setLoadError(res.error);
      } else {
        setLoadError(null);
        setPorts(res?.ports ?? []);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [routerId, retryCount]);

  // Same render-time adjustment for the bootstrap command: react to the
  // action result changing instead of calling setBootstrap synchronously
  // inside the effect.
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state?.success && state.bridgeId && state.bootstrapCommand) {
      setBootstrap({ bridgeId: state.bridgeId, command: state.bootstrapCommand });
    }
  }

  useEffect(() => {
    if (state?.success) {
      const timer = window.setTimeout(() => {
        setConfiguring(false);
        setHasDraft(false);
        setDraftPorts([]);
      }, 0);
      router.refresh();
      return () => window.clearTimeout(timer);
    }
  }, [state, router]);

  const assignedElsewhere = new Set(initialBridges.flatMap((b) => b.ports));

  function handleAddBridge() {
    setHasDraft(true);
    setDraftPorts([]);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const portName = e.dataTransfer.getData("text/plain");
    if (!portName) return;
    if (!hasDraft) setHasDraft(true);
    setDraftPorts((prev) => (prev.includes(portName) ? prev : [...prev, portName]));
  }

  if (loadError) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
        <span>{loadError}</span>
        <button
          type="button"
          onClick={() => setRetryCount((c) => c + 1)}
          disabled={retrying}
          className="shrink-0 rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-100 disabled:opacity-60"
        >
          {retrying ? "Connexion..." : "Réessayer"}
        </button>
      </div>
    );
  }

  return (
    <div>
      <ConfigAuditBanner routerId={routerId} />

      <p className="text-sm text-slate-500">
        Glissez des connexions entre les ports et les bridges. Chaque port
        physique ne peut appartenir qu&apos;à un seul bridge.
      </p>

      <TopologyCanvas
        ports={ports}
        initialBridges={initialBridges}
        assignedElsewhere={assignedElsewhere}
        draftPorts={draftPorts}
        hasDraft={hasDraft}
        onAddBridge={handleAddBridge}
        onDrop={handleDrop}
        onConfigure={openConfigure}
      />

      {configuring && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            action={formAction}
            className="w-full max-w-xl rounded-2xl bg-white p-8 shadow-xl"
          >
            <input type="hidden" name="routerId" value={routerId} />
            {draftPorts.map((p) => (
              <input key={p} type="hidden" name="ports" value={p} />
            ))}

            <div className="flex items-start justify-between">
              <h2 className="text-2xl font-semibold text-slate-900">
                Configurer l&apos;interface du bridge
              </h2>
              <button type="button" onClick={() => setConfiguring(false)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <p className="mt-2 text-base text-slate-500">
              Définissez l&apos;IP de la passerelle, la taille du sous-réseau et
              les services qui doivent fonctionner sur ce bridge.
            </p>

            {draftPorts.length === 0 && (
              <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
                Aucune interface assignée pour le moment. Annulez et glissez
                un port sur le bridge d&apos;abord, ou enregistrez maintenant et
                ajoutez des ports plus tard.
              </p>
            )}

            {state?.error && (
              <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
                {state.error}
              </p>
            )}

            <div className="mt-8 space-y-6">
              <div className="flex items-center gap-6">
                <label className="w-32 shrink-0 text-base font-medium text-slate-700">
                  Nom
                </label>
                <div className="flex-1">
                  <input
                    name="name"
                    defaultValue="SAFELINKHUB-BRIDGE"
                    disabled
                    className="w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-base text-slate-500 disabled:cursor-not-allowed"
                  />
                  <p className="mt-1.5 text-sm text-slate-400">
                    Le bridge principal ne peut pas être renommé.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-6">
                <label className="w-32 shrink-0 text-base font-medium text-slate-700">
                  IP de la passerelle
                </label>
                <input
                  name="gatewayIp"
                  required
                  placeholder="10.200.5.1"
                  value={gatewayIp}
                  onChange={(e) => setGatewayIp(e.target.value)}
                  className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-base placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-6">
                <label className="w-32 shrink-0 text-base font-medium text-slate-700">
                  Classe réseau
                </label>
                <div className="flex flex-1 flex-wrap gap-4">
                  {(["any", "A", "B", "C"] as NetworkClass[]).map((c) => (
                    <label key={c} className="flex items-center gap-1.5 text-sm text-slate-700">
                      <input
                        type="radio"
                        name="network-class"
                        checked={networkClass === c}
                        onChange={() => changeNetworkClass(c)}
                        className="h-4 w-4 border-slate-300"
                      />
                      {c === "any" ? "Toutes" : `Classe ${c}`}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-6">
                <label className="w-32 shrink-0 text-base font-medium text-slate-700">
                  Taille du sous-réseau
                </label>
                <select
                  name="subnetBits"
                  value={subnetBits}
                  onChange={(e) => setSubnetBits(Number(e.target.value))}
                  className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-base focus:border-slate-400 focus:outline-none"
                >
                  {CLASS_PREFIX_OPTIONS[networkClass].map((bits) => (
                    <option key={bits} value={bits}>
                      /{bits}
                    </option>
                  ))}
                </select>
              </div>

              <hr className="border-slate-100" />

              <div>
                <p className="text-base font-semibold text-slate-700">Services du bridge</p>

                <div className="mt-4 flex items-center justify-between">
                  <span>
                    <span className="block text-base font-medium text-slate-700">
                      Serveur Hotspot
                    </span>
                    <span className="mt-0.5 block text-sm text-slate-400">
                      Configurer le portail captif SafeLinkHub sur ce bridge.
                    </span>
                  </span>
                  <ToggleSwitch name="hotspotEnabled" defaultChecked />
                </div>

                <label className="mt-3 flex items-center gap-2 text-sm text-slate-500">
                  <input
                    type="checkbox"
                    name="preventSharing"
                    defaultChecked
                    className="h-4 w-4 rounded border-slate-300 text-slate-900"
                  />
                  Empêcher le partage du hotspot (TTL=1)
                </label>

                <div className="mt-5 flex items-center justify-between">
                  <span>
                    <span className="block text-base font-medium text-slate-700">
                      Serveur PPPoE
                    </span>
                    <span className="mt-0.5 block text-sm text-slate-400">
                      Activer l&apos;authentification PPPoE pour ce bridge.
                    </span>
                  </span>
                  <ToggleSwitch name="pppoeEnabled" disabled />
                </div>

                <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  <span className="font-medium">Le PPPoE n&apos;est pas activé pour votre organisation.</span>{" "}
                  Veuillez contacter le support pour activer cette fonctionnalité.
                </p>
              </div>
            </div>

            <div className="mt-8 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfiguring(false)}
                className="rounded-lg border border-slate-300 px-5 py-2.5 text-base font-medium text-slate-600 hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={pending || draftPorts.length === 0}
                className="rounded-lg bg-slate-900 px-5 py-2.5 text-base font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {pending ? "Enregistrement..." : "Enregistrer les modifications"}
              </button>
            </div>
          </form>
        </div>
      )}

      {bootstrap && (
        <BootstrapModal
          bridgeId={bootstrap.bridgeId}
          command={bootstrap.command}
          onClose={() => {
            setBootstrap(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
