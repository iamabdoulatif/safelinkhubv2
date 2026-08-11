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
  GATEWAY_IP_PRESETS,
  GATEWAY_IP_PRESET_GROUPS,
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

function interfaceLabel(
  port: Pick<Port, "name" | "type">,
  allPorts?: readonly Pick<Port, "name" | "type">[] | null,
) {
  // MikroTik only maps wifi1 to the 5GHz radio on dual-radio boards
  // (hAP ax², ax³, ...) — when wifi1 is the board's only radio (hAP ax
  // lite) it is the 2.4GHz one, so the band tag depends on wifi2 existing.
  const dualRadio = allPorts ? allPorts.some((p) => p.name === "wifi2") : true;
  if (port.name === "wifi1") return dualRadio ? "wifi1 5GHz" : "wifi1 2,4GHz";
  if (port.name === "wifi2") return "wifi2 2,4GHz";
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
      <span className="absolute inset-0 rounded-full bg-clay transition-colors peer-checked:bg-ink peer-focus-visible:ring-2 peer-focus-visible:ring-ink peer-focus-visible:outline-none" />
      <span className="absolute left-1 h-5 w-5 rounded-full bg-paper shadow transition-transform peer-checked:translate-x-5" />
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
      onClick={onConfigure}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onConfigure();
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`Bridge ${bridge.name}, appuyez sur Entrée pour configurer`}
      onDragOver={(e) => onDrop && e.preventDefault()}
      onDrop={onDrop}
      className={`relative w-80 shrink-0 rounded-xl border bg-paper p-5 ${
        draft ? "border-ok" : "border-ok"
      }`}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onConfigure();
        }}
        className="absolute -top-3.5 left-1/2 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border border-ok bg-paper text-ok hover:bg-clay focus-visible:ring-2 focus-visible:ring-ink focus-visible:outline-none"
        aria-label="Configurer le bridge"
      >
        <Plus className="h-4 w-4" />
      </button>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-ok" />
          <p className="text-base font-semibold text-ink">
            {draft ? "SAFELINKHUB-BRIDGE" : bridge.name}
          </p>
        </div>
        <SlidersHorizontal className="h-4 w-4 text-ink-soft" />
      </div>

      <div className="mt-6 flex items-center justify-between text-sm">
        <span className="text-ink-soft">IP de la passerelle</span>
        <span className="rounded bg-clay px-2.5 py-1.5 font-medium text-ink-soft">
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
              className="rounded bg-clay px-2 py-1 text-[11px] font-medium text-ok"
            >
              {p}
            </span>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-md border-2 border-dashed border-ok bg-clay/40 py-4 text-center text-xs font-medium text-ok">
          Déposez une interface ici
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="rounded-full bg-brand px-2.5 py-1 text-[11px] font-semibold text-ink">
          {bridge.hotspotEnabled ? "Hotspot" : "Pas de Hotspot"}
        </span>
        <span className="rounded-full bg-clay px-2.5 py-1 text-[11px] font-semibold text-ink-soft">
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
      className="relative w-64 shrink-0 rounded-xl border border-line-soft bg-paper p-5"
    >
      <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-clay px-2.5 py-0.5 text-[10px] font-semibold text-brand-deep">
        Géré automatiquement
      </span>

      <div className="mt-1 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-brand-deep" />
          <p className="text-base font-semibold text-ink">DOCKERS</p>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between text-sm">
        <span className="text-ink-soft">IP de la passerelle</span>
        <span className="rounded bg-clay px-2.5 py-1.5 font-medium text-ink-soft">
          11.11.11.1/28
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {ports.map((p) => (
          <span
            key={p}
            className="rounded bg-clay px-2 py-1 text-[11px] font-medium text-brand-deep"
          >
            {p}
          </span>
        ))}
      </div>

      <p className="mt-4 text-[11px] text-ink-soft">
        Conteneur MikHmon — créé par l&apos;auto-setup, voir plus bas.
      </p>
    </div>
  );
}

// Placeholder shown before the auto-setup has provisioned the container
// stack. The manual "Créer le bridge DOCKERS + MikHmon" panel that used to
// live here duplicated the auto-setup's own provisioning path (two buttons
// building the same bridge/veth/container) — the auto-setup step is now the
// single place that creates it.
function DockerBridgePlaceholder() {
  return (
    <div className="relative w-72 shrink-0 rounded-xl border border-dashed border-line-soft bg-paper/80 p-5">
      <div className="flex items-center gap-2">
        <Layers className="h-5 w-5 text-brand-deep" />
        <p className="text-base font-semibold text-ink">DOCKERS</p>
      </div>
      <p className="mt-1.5 text-xs text-ink-soft">
        Bridge DOCKERS + veth MIKHMON + conteneur MikHmon — créés
        automatiquement par la configuration automatique (Étape 3), aucune
        action nécessaire ici.
      </p>
    </div>
  );
}

function InterfaceTile({
  port,
  allPorts,
  used,
  selected,
  onSelect,
  tileRef,
}: {
  port: Port;
  allPorts: readonly Port[];
  used: boolean;
  selected: boolean;
  onSelect: () => void;
  tileRef: (el: HTMLDivElement | null) => void;
}) {
  const isVeth = isVethInterface(port);
  const draggable = !used && !port.disabled && !isVeth;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect();
    }
  };

  return (
    <div
      ref={tileRef}
      draggable={draggable}
      onDragStart={(e) => draggable && e.dataTransfer.setData("text/plain", port.name)}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      tabIndex={draggable ? 0 : -1}
      role="button"
      aria-pressed={selected}
      aria-label={`Port ${port.name}${used ? " (déjà utilisé)" : ""}`}
      title={
        isVeth
          ? `${port.name} est l'interface du conteneur Docker (bridge DOCKERS)`
          : port.disabled
            ? `${port.name} est désactivé sur le routeur`
            : selected
              ? "Appuyez sur Entrée pour connecter à SAFELINKHUB-BRIDGE"
              : undefined
      }
      className={`relative flex h-16 w-[72px] shrink-0 flex-col items-center justify-center gap-1 rounded-lg border text-[11px] ${
        port.disabled
          ? "cursor-not-allowed border-line-soft bg-clay text-clay"
          : isVeth
            ? "cursor-not-allowed border-line-soft bg-clay text-brand-deep"
            : used
              ? "border-ok bg-clay text-ok"
              : selected
                ? "cursor-pointer border-orange-400 bg-orange-50 text-orange-700 ring-2 ring-orange-400/30"
                : "cursor-grab border-line-soft bg-paper text-ink-soft hover:border-ok hover:text-ink"
      }`}
    >
      {selected && (
        <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded bg-orange-500 px-1.5 py-0.5 text-[9px] font-semibold text-white whitespace-nowrap">
          Entrée pour connecter
        </span>
      )}
      {port.name === "ether1" && (
        <span className="absolute -top-2 rounded bg-clay px-1 py-0.5 text-[9px] font-semibold text-warn">
          WAN
        </span>
      )}
      {isVeth ? (
        <Box className="h-4 w-4 text-brand-deep" />
      ) : isWifiInterface(port) ? (
        <Wifi className={`h-4 w-4 ${port.disabled ? "text-clay" : "text-brand"}`} />
      ) : (
        <Cable className={`h-4 w-4 ${port.disabled ? "text-clay" : "text-ok"}`} />
      )}
      <span className="max-w-full truncate px-1 leading-tight">{interfaceLabel(port, allPorts)}</span>
    </div>
  );
}

function RouterDeviceCard({
  ports,
  assignedElsewhere,
  draftPorts,
  selectedPort,
  onSelectPort,
  registerPortRef,
}: {
  ports: Port[] | null;
  assignedElsewhere: Set<string>;
  draftPorts: string[];
  selectedPort: string | null;
  onSelectPort: (name: string) => void;
  registerPortRef: (name: string, el: HTMLDivElement | null) => void;
}) {
  return (
    <div className="absolute left-1/2 top-7 w-[min(98%,1100px)] -translate-x-1/2 border-2 border-line bg-paper/95 p-5">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2 border-b border-line-soft pb-4">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-ink text-sm font-bold text-white">
            M
          </span>
          <span className="rounded bg-clay px-2.5 py-1.5 text-sm text-ink-soft">
            hAP ax lite v7.19.4 (stable) • uptime 6m6s
          </span>
        </div>
        <span className="text-sm text-ink-soft">
          Glissez un port pour le connecter à un bridge
        </span>
      </div>
      <div className="flex flex-nowrap items-start gap-3 overflow-x-auto pb-1">
        {ports === null && (
          <span className="py-8 text-sm text-ink-soft">Chargement des interfaces...</span>
        )}
        {ports?.map((port) => (
          <InterfaceTile
            key={port.name}
            port={port}
            allPorts={ports}
            used={assignedElsewhere.has(port.name) || draftPorts.includes(port.name)}
            selected={selectedPort === port.name}
            onSelect={() => onSelectPort(port.name)}
            tileRef={(el) => registerPortRef(port.name, el)}
          />
        ))}
      </div>
    </div>
  );
}

function TopologyCanvas({
  routerId,
  ports,
  initialBridges,
  assignedElsewhere,
  draftPorts,
  hasDraft,
  onAddBridge,
  onDrop,
  onConfigure,
  keyboardMode,
  setKeyboardMode,
  formAction,
}: {
  routerId: string;
  ports: Port[] | null;
  initialBridges: SavedBridge[];
  assignedElsewhere: Set<string>;
  draftPorts: string[];
  hasDraft: boolean;
  onAddBridge: () => void;
  onDrop: (e: React.DragEvent) => void;
  onConfigure: () => void;
  keyboardMode: boolean;
  setKeyboardMode: (v: boolean) => void;
  formAction: (payload: FormData) => void;
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
  const [selectedPort, setSelectedPort] = useState<string | null>(null);

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

  const handleSelectPort = useCallback((name: string) => {
    setSelectedPort((prev) => (prev === name ? null : name));
  }, []);

  return (
    <div className="mt-5 overflow-hidden border-2 border-line bg-paper">
      <div className="flex items-center justify-between border-b border-line-soft bg-clay px-4 py-3">
        <span className="text-sm font-medium text-ink-soft">Mode d&apos;édition</span>
        <button
          type="button"
          onClick={() => setKeyboardMode(!keyboardMode)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            keyboardMode
              ? "bg-brand text-ink hover:bg-brand-deep"
              : "border border-line-soft bg-paper text-ink-soft hover:bg-clay"
          }`}
          aria-pressed={keyboardMode}
        >
          {keyboardMode ? "Mode clavier actif" : "Mode clavier"}
        </button>
      </div>

      <div className="grid min-h-[480px] grid-cols-1 md:min-h-[700px] md:grid-cols-[300px_1fr]">
        <aside className="border-b border-line-soft bg-paper p-6 md:border-b-0 md:border-r">
          <p className="text-sm font-medium text-ok">
            Double-cliquez sur une ligne de connexion existante pour la
            supprimer.
          </p>
          <p className="mt-2 text-sm text-ok">
            Double-cliquez sur un bridge pour le configurer.
          </p>
          <button
            type="button"
            onClick={onAddBridge}
            className="mt-6 w-full rounded-md bg-ink px-4 py-3.5 text-sm font-semibold text-white hover:bg-[#3A362F]"
          >
            + Ajouter un bridge
          </button>
        </aside>

        <section
          ref={sectionRef}
          className="relative min-h-[700px] overflow-hidden bg-clay"
        >
          {keyboardMode ? (
            <form
              action={formAction}
              className="absolute inset-0 overflow-y-auto p-6"
            >
              <input type="hidden" name="routerId" value={routerId} />
              <input type="hidden" name="name" value="SAFELINKHUB-BRIDGE" />
              <input
                type="hidden"
                name="gatewayIp"
                value={visibleBridge?.gatewayIp === "Not configured" ? "10.200.5.1" : (visibleBridge?.gatewayIp ?? "10.200.5.1")}
              />
              <input
                type="hidden"
                name="subnetBits"
                value={visibleBridge?.subnetBits ?? 24}
              />
              <input type="hidden" name="hotspotEnabled" value="on" />
              <input type="hidden" name="preventSharing" value="on" />

              <p className="text-sm font-medium text-ink mb-4">
                Sélectionnez les ports à assigner au bridge :
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {ports?.map((port) => {
                  const isVeth = isVethInterface(port);
                  const used = assignedElsewhere.has(port.name) || draftPorts.includes(port.name);
                  const disabled = port.disabled || isVeth;
                  return (
                    <label
                      key={port.name}
                      className={`flex items-center gap-2 rounded-lg border p-3 ${
                        disabled
                          ? "opacity-50 cursor-not-allowed border-line-soft"
                          : "border-line-soft bg-paper hover:border-ok cursor-pointer"
                      }`}
                    >
                      <input
                        type="checkbox"
                        name="ports"
                        value={port.name}
                        disabled={disabled}
                        defaultChecked={used}
                        className="h-4 w-4 rounded border-line-soft text-ok focus:ring-ink focus:outline-none"
                      />
                      <span className="text-sm text-ink">{interfaceLabel(port, ports)}</span>
                      {port.disabled && (
                        <span className="ml-auto text-[10px] text-ink-soft">(désactivé)</span>
                      )}
                      {isVeth && (
                        <span className="ml-auto text-[10px] text-brand-deep">(Docker)</span>
                      )}
                    </label>
                  );
                })}
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setKeyboardMode(false)}
                  className="rounded-lg border border-line-soft px-5 py-2.5 text-sm font-medium text-ink-soft hover:bg-clay"
                >
                  Retour au mode visuel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-ink px-5 py-2.5 text-sm font-medium text-white hover:bg-brand"
                >
                  Enregistrer les modifications
                </button>
              </div>
            </form>
          ) : (
            <>
              <RouterDeviceCard
                ports={ports}
                assignedElsewhere={assignedElsewhere}
                draftPorts={draftPorts}
                selectedPort={selectedPort}
                onSelectPort={handleSelectPort}
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
                      <div className="flex h-40 w-80 items-center justify-center rounded-xl border-2 border-dashed border-ok bg-paper/80 text-sm font-medium text-ok">
                        Cliquez sur &quot;Ajouter un bridge&quot; pour commencer
                      </div>
                    )}
                    {hasDockerBridge ? (
                      <DockerBridgeNode
                        ports={dockerPorts}
                        nodeRef={(el) => {
                          dockerBridgeRef.current = el;
                        }}
                      />
                    ) : (
                      <DockerBridgePlaceholder />
                    )}
                  </div>
                </>
              ) : (
                <div className="absolute left-1/2 top-[290px] flex h-40 w-80 -translate-x-1/2 items-center justify-center rounded-xl border-2 border-dashed border-ok bg-paper/80 text-sm font-medium text-ok">
                  Cliquez sur &quot;Ajouter un bridge&quot; pour commencer
                </div>
              )}
            </>
          )}
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
  const [keyboardMode, setKeyboardMode] = useState(false);
  const gatewayIpRef = useRef<HTMLInputElement>(null);

  // The visual canvas relies on absolutely-positioned, horizontally
  // scrollable nodes that don't translate to small screens — default to
  // the list+form "mode clavier" there instead. Must run post-mount
  // (matchMedia isn't available during SSR), so this can't be a lazy
  // useState initializer without a hydration mismatch.
  useEffect(() => {
    if (window.matchMedia("(max-width: 767px)").matches) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setKeyboardMode(true);
    }
  }, []);

  function changeNetworkClass(next: NetworkClass) {
    setNetworkClass(next);
    if (!CLASS_PREFIX_OPTIONS[next].includes(subnetBits)) {
      setSubnetBits(CLASS_DEFAULT_PREFIX[next]);
    }
  }

  function openConfigure() {
    const existing = initialBridges[0];
    if (existing && existing.gatewayIp !== "Not configured") {
      setGatewayIp(existing.gatewayIp);
      const cls = classForPrefix(existing.subnetBits);
      // Bridges saved before the /8–/24 cap may carry a prefix the
      // dropdown no longer offers — snap those to the class default.
      const bits = CLASS_PREFIX_OPTIONS[cls].includes(existing.subnetBits)
        ? existing.subnetBits
        : CLASS_DEFAULT_PREFIX[cls];
      setSubnetBits(bits);
      setNetworkClass(cls);
    } else {
      setGatewayIp("10.200.5.1");
      setSubnetBits(19);
      setNetworkClass("B");
    }
    setConfiguring(true);
  }

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
        setKeyboardMode(false);
      }, 0);
      router.refresh();
      return () => window.clearTimeout(timer);
    }
  }, [state, router]);

  useEffect(() => {
    if (configuring) {
      const timer = setTimeout(() => gatewayIpRef.current?.focus(), 0);
      return () => clearTimeout(timer);
    }
  }, [configuring]);

  useEffect(() => {
    if (!configuring) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setConfiguring(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [configuring]);

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
          className="shrink-0 rounded-md border border-red-200 bg-paper px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-100 disabled:opacity-60"
        >
          {retrying ? "Connexion..." : "Réessayer"}
        </button>
      </div>
    );
  }

  return (
    <div>
      <ConfigAuditBanner routerId={routerId} />

      <p className="text-sm text-ink-soft">
        Glissez des connexions entre les ports et les bridges. Chaque port
        physique ne peut appartenir qu&apos;à un seul bridge.
      </p>

      <TopologyCanvas
        routerId={routerId}
        ports={ports}
        initialBridges={initialBridges}
        assignedElsewhere={assignedElsewhere}
        draftPorts={draftPorts}
        hasDraft={hasDraft}
        onAddBridge={handleAddBridge}
        onDrop={handleDrop}
        onConfigure={openConfigure}
        keyboardMode={keyboardMode}
        setKeyboardMode={setKeyboardMode}
        formAction={formAction}
      />

      {configuring && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfiguring(false);
          }}
        >
          <form
            action={formAction}
            role="dialog"
            aria-modal="true"
            aria-labelledby="bridge-config-title"
            className="max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto rounded-2xl bg-paper p-4 sm:p-8"
          >
            <input type="hidden" name="routerId" value={routerId} />
            {draftPorts.map((p) => (
              <input key={p} type="hidden" name="ports" value={p} />
            ))}

            <div className="flex items-start justify-between">
              <h2 id="bridge-config-title" className="text-2xl font-semibold text-ink">
                Configurer l&apos;interface du bridge
              </h2>
              <button
                type="button"
                onClick={() => setConfiguring(false)}
                aria-label="Fermer"
                className="rounded-md p-1 hover:bg-clay focus-visible:ring-2 focus-visible:ring-ink focus-visible:outline-none"
              >
                <X className="h-5 w-5 text-ink-soft" />
              </button>
            </div>
            <p className="mt-2 text-base text-ink-soft">
              Définissez l&apos;IP de la passerelle, la taille du sous-réseau et
              les services qui doivent fonctionner sur ce bridge.
            </p>

            {draftPorts.length === 0 && (
              <p className="mt-4 rounded-md bg-clay px-3 py-2 text-sm text-warn">
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
                <label className="w-32 shrink-0 text-base font-medium text-ink">
                  Nom
                </label>
                <div className="flex-1">
                  <input
                    name="name"
                    defaultValue="SAFELINKHUB-BRIDGE"
                    disabled
                    className="w-full rounded-lg border border-line-soft bg-clay px-4 py-2.5 text-base text-ink-soft disabled:cursor-not-allowed"
                  />
                  <p className="mt-1.5 text-sm text-ink-soft">
                    Le bridge principal ne peut pas être renommé.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-6">
                <label className="w-32 shrink-0 pt-2.5 text-base font-medium text-ink">
                  IP de la passerelle
                </label>
                <div className="flex-1">
                  <input
                    ref={gatewayIpRef}
                    name="gatewayIp"
                    required
                    placeholder="10.200.5.1"
                    value={gatewayIp}
                    onChange={(e) => setGatewayIp(e.target.value)}
                    className="w-full rounded-lg border border-line-soft px-4 py-2.5 text-base placeholder:text-ink-soft focus:border-ok focus:ring-2 focus:ring-ink/20 focus:outline-none"
                  />
                  {/* Sélecteur et non plus une rangée de pastilles : la liste
                      partagée est passée de 7 à 17 adresses, et les groupes
                      portent l'avertissement sur le bloc 192.168 — ce qu'une
                      pastille ne peut pas dire. Le champ reste libre. */}
                  <select
                    aria-label="Choisir une passerelle courante"
                    value={GATEWAY_IP_PRESETS.includes(gatewayIp) ? gatewayIp : ""}
                    onChange={(e) => {
                      if (e.target.value) setGatewayIp(e.target.value);
                    }}
                    className="mt-2 w-full rounded-lg border border-line-soft px-3 py-2 text-sm text-ink-soft focus:border-ok focus:ring-2 focus:ring-ink/20 focus:outline-none"
                  >
                    <option value="">Passerelles courantes…</option>
                    {GATEWAY_IP_PRESET_GROUPS.map((group) => (
                      <optgroup key={group.label} label={group.label}>
                        {group.ips.map((ip) => (
                          <option key={ip} value={ip}>
                            {ip}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-6">
                <label className="w-32 shrink-0 text-base font-medium text-ink">
                  Classe réseau
                </label>
                <div className="flex flex-1 flex-wrap gap-4">
                  {(["any", "A", "B", "C"] as NetworkClass[]).map((c) => (
                    <label key={c} className="flex items-center gap-1.5 text-sm text-ink">
                      <input
                        type="radio"
                        name="network-class"
                        checked={networkClass === c}
                        onChange={() => changeNetworkClass(c)}
                        className="h-4 w-4 border-line-soft text-ok focus:ring-ink focus:outline-none"
                      />
                      {c === "any" ? "Toutes" : `Classe ${c}`}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-6">
                <label className="w-32 shrink-0 text-base font-medium text-ink">
                  Taille du sous-réseau
                </label>
                <select
                  name="subnetBits"
                  value={subnetBits}
                  onChange={(e) => setSubnetBits(Number(e.target.value))}
                  className="flex-1 rounded-lg border border-line-soft px-4 py-2.5 text-base focus:border-ok focus:ring-2 focus:ring-ink/20 focus:outline-none"
                >
                  {CLASS_PREFIX_OPTIONS[networkClass].map((bits) => (
                    <option key={bits} value={bits}>
                      /{bits}
                    </option>
                  ))}
                </select>
              </div>

              <hr className="border-line-soft" />

              <div>
                <p className="text-base font-semibold text-ink">Services du bridge</p>

                <div className="mt-4 flex items-center justify-between">
                  <span>
                    <span className="block text-base font-medium text-ink">
                      Serveur Hotspot
                    </span>
                    <span className="mt-0.5 block text-sm text-ink-soft">
                      Configurer le portail captif SafeLinkHub sur ce bridge.
                    </span>
                  </span>
                  <ToggleSwitch name="hotspotEnabled" defaultChecked />
                </div>

                <label className="mt-3 flex items-center gap-2 text-sm text-ink-soft">
                  <input
                    type="checkbox"
                    name="preventSharing"
                    defaultChecked
                    className="h-4 w-4 rounded border-line-soft text-ok focus:ring-ink focus:outline-none"
                  />
                  Empêcher le partage du hotspot (TTL=1)
                </label>

                <div className="mt-5 flex items-center justify-between">
                  <span>
                    <span className="block text-base font-medium text-ink">
                      Serveur PPPoE
                    </span>
                    <span className="mt-0.5 block text-sm text-ink-soft">
                      Activer l&apos;authentification PPPoE pour ce bridge.
                    </span>
                  </span>
                  <ToggleSwitch name="pppoeEnabled" disabled />
                </div>

                <p className="mt-3 rounded-md bg-clay px-3 py-2 text-sm text-warn">
                  <span className="font-medium">Le PPPoE n&apos;est pas activé pour votre organisation.</span>{" "}
                  Veuillez contacter le support pour activer cette fonctionnalité.
                </p>
              </div>
            </div>

            <div className="mt-8 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfiguring(false)}
                className="rounded-lg border border-line-soft px-5 py-2.5 text-base font-medium text-ink-soft hover:bg-clay"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={pending || draftPorts.length === 0}
                className="rounded-lg bg-ink px-5 py-2.5 text-base font-medium text-white hover:bg-brand disabled:opacity-60"
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
