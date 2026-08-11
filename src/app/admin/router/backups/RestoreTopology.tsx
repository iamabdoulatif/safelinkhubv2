"use client";

/*
 * Topologie de reprise : l'ancien routeur (par sa sauvegarde) à gauche, le
 * rechange à droite, et entre les deux les quatre canaux qui traversent —
 * identité, WiFi, données, portail.
 *
 * Le remplacement d'un routeur est une opération spatiale ; une liste de
 * puces la raconte mal. Ici chaque canal porte son propre état : ce qui est
 * prévu, ce qui a été adapté, ce qui bloque. Reprend le vocabulaire visuel de
 * la scène isométrique du landing (aplats, câbles nets, paquets animés en CSS)
 * et les variables de thème, donc pas de couleur en dur : le mode sombre suit.
 */

export type ChannelState = "idle" | "planned" | "done" | "blocked" | "failed" | "skipped";

export type TopologyChannel = {
  key: string;
  label: string;
  detail: string;
  state: ChannelState;
};

export type TopologyNode = {
  title: string;
  subtitle: string;
  meta: string;
};

const COLOR: Record<ChannelState, string> = {
  idle: "var(--line-soft)",
  planned: "var(--brand)",
  done: "var(--ok)",
  blocked: "var(--err)",
  failed: "var(--err)",
  skipped: "var(--line-soft)",
};

/** Un canal « en cours » anime ses paquets ; les autres restent des traits nets. */
function Channel({
  channel,
  y,
  flowing,
}: {
  channel: TopologyChannel;
  y: number;
  flowing: boolean;
}) {
  const color = COLOR[channel.state];
  const path = `M 208 ${y} L 432 ${y}`;
  const dim = channel.state === "idle" || channel.state === "skipped";

  return (
    <g>
      <path
        d={path}
        stroke={color}
        strokeWidth={dim ? 2 : 3}
        strokeDasharray={channel.state === "skipped" ? "4 6" : undefined}
        fill="none"
      />
      {flowing && channel.state !== "blocked" && channel.state !== "skipped" && (
        <>
          <rect
            className="iso-packet"
            width="7"
            height="7"
            x={-3.5}
            y={-3.5}
            fill="var(--brand)"
            stroke="var(--ink)"
            strokeWidth="1.5"
            style={{ offsetPath: `path('${path}')`, animationDuration: "1.6s" }}
          />
          <rect
            className="iso-packet"
            width="7"
            height="7"
            x={-3.5}
            y={-3.5}
            fill="var(--brand)"
            stroke="var(--ink)"
            strokeWidth="1.5"
            style={{
              offsetPath: `path('${path}')`,
              animationDuration: "1.6s",
              animationDelay: "0.8s",
            }}
          />
        </>
      )}
      {/* Pointe de flèche : le sens de la reprise ne doit jamais être ambigu. */}
      <path
        d={`M 432 ${y} l -7 -4 l 0 8 z`}
        fill={color}
        stroke="none"
      />
      <text x="320" y={y - 8} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--ink)">
        {channel.label}
      </text>
      <text x="320" y={y + 14} textAnchor="middle" fontSize="10" fill="var(--ink-soft)">
        {channel.detail}
      </text>
    </g>
  );
}

function Device({
  node,
  x,
  accent,
  blocked,
}: {
  node: TopologyNode;
  x: number;
  accent: boolean;
  blocked?: boolean;
}) {
  const border = blocked ? "var(--err)" : "var(--ink)";
  return (
    <g>
      <rect
        x={x}
        y={60}
        width={180}
        height={180}
        fill={accent ? "var(--clay)" : "var(--paper)"}
        stroke={border}
        strokeWidth="2.5"
      />
      {/* Bandeau de façade + LED : signature visuelle du routeur, comme sur le landing. */}
      <rect x={x} y={60} width={180} height={22} fill={border} />
      <circle cx={x + 12} cy={71} r="3.5" fill="var(--brand)" className={accent ? "iso-led" : ""} />
      <text x={x + 26} y={75} fontSize="10" fontWeight="700" fill="var(--paper)">
        MIKROTIK
      </text>
      <text x={x + 12} y={112} fontSize="13" fontWeight="800" fill="var(--ink)">
        {node.title.length > 21 ? `${node.title.slice(0, 20)}…` : node.title}
      </text>
      <text x={x + 12} y={140} fontSize="11" fill="var(--ink-soft)">
        {node.subtitle.length > 27 ? `${node.subtitle.slice(0, 26)}…` : node.subtitle}
      </text>
      <text x={x + 12} y={164} fontSize="11" fill="var(--ink-soft)">
        {node.meta.length > 27 ? `${node.meta.slice(0, 26)}…` : node.meta}
      </text>
    </g>
  );
}

export default function RestoreTopology({
  source,
  target,
  channels,
  flowing,
  blocked,
  failed,
}: {
  source: TopologyNode;
  target: TopologyNode;
  channels: TopologyChannel[];
  /** Vrai pendant une restauration réelle : les paquets circulent. */
  flowing: boolean;
  blocked: boolean;
  /** La reprise a écrit une partie des données mais son contrôle final a échoué. */
  failed?: boolean;
}) {
  const rows = channels.slice(0, 4);
  const firstY = 98;
  const gap = 42;

  return (
    <figure className="mt-3 border-2 border-line bg-paper p-2">
      <svg
        viewBox="0 0 640 300"
        className="h-auto w-full"
        role="img"
        aria-label={`Reprise de ${source.title} vers ${target.title}`}
      >
        {/* Template string et non des nœuds juxtaposés : React n'accepte qu'un
            enfant texte unique dans <title>, sinon il avertit en console. */}
        <title>{`Reprise de ${source.title} vers ${target.title}`}</title>

        <text x="20" y="34" fontSize="10" fontWeight="700" fill="var(--ink-soft)">
          ANCIEN — SAUVEGARDE
        </text>
        <text x="620" y="34" textAnchor="end" fontSize="10" fontWeight="700" fill="var(--ink-soft)">
          RECHANGE
        </text>

        <Device node={source} x={20} accent={false} />
        <Device node={target} x={440} accent blocked={blocked || failed} />

        {rows.map((c, i) => (
          <Channel key={c.key} channel={c} y={firstY + i * gap} flowing={flowing} />
        ))}

        {blocked && (
          <text x="530" y="286" textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--err)">
            reprise impossible en l&apos;état
          </text>
        )}
        {!blocked && failed && (
          <text x="530" y="286" textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--err)">
            reprise incomplète — correction requise
          </text>
        )}
      </svg>

      {/* Légende : les couleurs seules ne suffisent pas (daltonisme, impression). */}
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 px-1 pb-1 pt-2 text-xs text-ink-soft">
        {rows.map((c) => (
          <span key={c.key} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: COLOR[c.state] }}
            />
            {c.label} —{" "}
            {c.state === "idle"
              ? "à scanner"
              : c.state === "planned"
                ? "prévu"
                : c.state === "done"
                  ? "repris"
                  : c.state === "failed"
                    ? "à corriger"
                  : c.state === "skipped"
                    ? "sans objet"
                    : "bloqué"}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
