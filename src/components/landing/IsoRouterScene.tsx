/*
 * Schéma réseau isométrique Bitume :
 * fibre + Starlink en double WAN vers un MikroTik, puis routeurs/AP en réseau.
 * Aplats opaques, câbles nets, paquets animés CSS, lisible en desktop/mobile.
 */

const FIBER_CABLE = "M 84 84 C 138 86, 172 116, 214 154";
const STARLINK_CABLE = "M 426 70 C 378 82, 338 114, 306 154";
const ROUTER_LEFT = "M 235 248 C 198 278, 156 292, 112 316";
const ROUTER_RIGHT = "M 285 248 C 326 278, 370 294, 414 318";
const ROUTER_BOTTOM = "M 260 258 C 260 292, 260 320, 260 350";

function DataPacket({
  path,
  delay = "0s",
  reverse = false,
  size = 8,
}: {
  path: string;
  delay?: string;
  reverse?: boolean;
  size?: number;
}) {
  return (
    <rect
      className="iso-packet"
      width={size}
      height={size}
      x={-size / 2}
      y={-size / 2}
      fill={reverse ? "#1C1917" : "#EAB308"}
      stroke={reverse ? "none" : "#1C1917"}
      strokeWidth="1.5"
      style={{
        offsetPath: `path('${path}')`,
        animationDelay: delay,
        animationDirection: reverse ? "reverse" : "normal",
      }}
    />
  );
}

function Label({
  x,
  y,
  children,
  align = "middle",
}: {
  x: number;
  y: number;
  children: React.ReactNode;
  align?: "start" | "middle" | "end";
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={align}
      fontFamily="var(--font-geist-mono), monospace"
      fontSize="11"
      fontWeight="700"
      fill="#57534E"
      letterSpacing="0.4"
    >
      {children}
    </text>
  );
}

function MiniRouter({
  x,
  y,
  label,
  labelX = 28,
  labelY = 61,
  labelAlign = "middle",
  delay = "0s",
}: {
  x: number;
  y: number;
  label: string;
  labelX?: number;
  labelY?: number;
  labelAlign?: "start" | "middle" | "end";
  delay?: string;
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className="iso-drift" style={{ animationDelay: delay }}>
        <path d="M 0 16 L 28 30 L 28 45 L 0 31 Z" fill="#1C1917" />
        <path d="M 28 30 L 56 16 L 56 31 L 28 45 Z" fill="#57534E" />
        <path d="M 28 2 L 56 16 L 28 30 L 0 16 Z" fill="#F0EDE6" stroke="#1C1917" strokeWidth="2" />
        <path d="M 28 8 L 43 16 L 28 24 L 13 16 Z" fill="#EAB308" />
        <path className="iso-led" d="M 39 33 l 5 -2.5 l 0 5 l -5 2.5 Z" fill="#EAB308" />
        <Label x={labelX} y={labelY} align={labelAlign}>{label}</Label>
      </g>
    </g>
  );
}

export default function IsoRouterScene({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 520 455"
      className={className}
      role="img"
      aria-label="Schéma d'un MikroTik connecté à la fibre et à Starlink, distribuant le réseau vers plusieurs routeurs"
    >
      {/* Zone de couverture réseau */}
      <circle cx="260" cy="220" r="178" stroke="#D8D2C6" strokeWidth="2" fill="none" />
      <circle cx="260" cy="220" r="116" stroke="#D8D2C6" strokeWidth="2" fill="none" />
      <path
        d="M 260 42 A 178 178 0 0 1 438 220"
        stroke="#EAB308"
        strokeWidth="4"
        fill="none"
      />

      {/* Sources Internet */}
      <g transform="translate(48 48)">
        <g className="iso-node">
          <path d="M 0 24 L 24 36 L 48 24 L 24 12 Z" fill="#F0EDE6" stroke="#1C1917" strokeWidth="2" />
          <path d="M 8 24 L 24 32 L 40 24 L 24 16 Z" fill="#EAB308" />
          <path d="M 24 36 V 52" stroke="#1C1917" strokeWidth="3" />
          <path d="M 12 52 H 36" stroke="#1C1917" strokeWidth="3" />
          <Label x={24} y={72}>Fibre</Label>
        </g>
      </g>

      <g transform="translate(394 36)">
        <g className="iso-node" style={{ animationDelay: "0.6s" }}>
          <path d="M 0 36 C 18 8, 52 8, 70 36" fill="#F0EDE6" stroke="#1C1917" strokeWidth="2" />
          <path d="M 12 34 C 26 18, 44 18, 58 34" fill="none" stroke="#EAB308" strokeWidth="5" />
          <path d="M 35 36 V 58" stroke="#1C1917" strokeWidth="3" />
          <path d="M 22 58 H 48" stroke="#1C1917" strokeWidth="3" />
          <Label x={35} y={78}>Starlink</Label>
        </g>
      </g>

      {/* Câbles WAN */}
      <path className="iso-link" d={FIBER_CABLE} stroke="#1C1917" strokeWidth="2.5" fill="none" />
      <path className="iso-link" d={STARLINK_CABLE} stroke="#1C1917" strokeWidth="2.5" fill="none" />
      <DataPacket path={FIBER_CABLE} delay="0s" />
      <DataPacket path={FIBER_CABLE} delay="1.5s" reverse size={6} />
      <DataPacket path={STARLINK_CABLE} delay="0.7s" />
      <DataPacket path={STARLINK_CABLE} delay="2.2s" reverse size={6} />

      {/* Câbles LAN vers routeurs/AP */}
      <path className="iso-link" d={ROUTER_LEFT} stroke="#1C1917" strokeWidth="2.5" fill="none" />
      <path className="iso-link" d={ROUTER_RIGHT} stroke="#1C1917" strokeWidth="2.5" fill="none" />
      <path className="iso-link" d={ROUTER_BOTTOM} stroke="#1C1917" strokeWidth="2.5" fill="none" />
      <DataPacket path={ROUTER_LEFT} delay="0.2s" />
      <DataPacket path={ROUTER_RIGHT} delay="0.9s" />
      <DataPacket path={ROUTER_BOTTOM} delay="1.3s" />

      {/* MikroTik principal */}
      <g className="iso-float">
        <path d="M 238 168 V 104" stroke="#1C1917" strokeWidth="4" />
        <path d="M 294 168 V 104" stroke="#1C1917" strokeWidth="4" />
        <circle cx="238" cy="100" r="5" fill="#EAB308" stroke="#1C1917" strokeWidth="2" />
        <circle cx="294" cy="100" r="5" fill="#EAB308" stroke="#1C1917" strokeWidth="2" />
        <circle className="iso-wave" cx="238" cy="100" r="16" stroke="#EAB308" strokeWidth="2.5" fill="none" />
        <circle
          className="iso-wave"
          cx="294"
          cy="100"
          r="16"
          stroke="#EAB308"
          strokeWidth="2.5"
          fill="none"
          style={{ animationDelay: "1s" }}
        />

        <path d="M 174 174 L 260 217 L 260 253 L 174 210 Z" fill="#1C1917" />
        <path d="M 260 217 L 346 174 L 346 210 L 260 253 Z" fill="#57534E" />
        <path
          d="M 260 131 L 346 174 L 260 217 L 174 174 Z"
          fill="#F0EDE6"
          stroke="#1C1917"
          strokeWidth="2"
        />
        <path d="M 296 149 L 330 166 L 296 183 L 262 166 Z" fill="#EAB308" />
        <path d="M 186 189 l 9 4.5 l 0 9 l -9 -4.5 Z" fill="#FBFAF8" />
        <path d="M 202 197 l 9 4.5 l 0 9 l -9 -4.5 Z" fill="#FBFAF8" />
        <path d="M 218 205 l 9 4.5 l 0 9 l -9 -4.5 Z" fill="#FBFAF8" />
        <path className="iso-led" d="M 278 236 l 6 -3 l 0 6 l -6 3 Z" fill="#EAB308" />
        <path
          className="iso-led"
          d="M 294 228 l 6 -3 l 0 6 l -6 3 Z"
          fill="#EAB308"
          style={{ animationDelay: "0.45s" }}
        />
      </g>
      <Label x={260} y={294}>MikroTik · dual WAN</Label>

      {/* Routeurs/AP distribués */}
      <MiniRouter x={46} y={308} label="AP Hotspot" labelX={2} labelY={70} labelAlign="start" />
      <MiniRouter
        x={398}
        y={304}
        label="Routeur site B"
        labelX={54}
        labelY={70}
        labelAlign="end"
        delay="0.7s"
      />
      <MiniRouter x={232} y={344} label="Routeur site C" labelY={78} delay="1.2s" />

      {/* Clients autour du réseau */}
      <g transform="translate(82 236)">
        <path d="M 0 24 L 22 35 L 22 54 L 0 43 Z" fill="#1C1917" />
        <path d="M 22 35 L 44 24 L 44 43 L 22 54 Z" fill="#57534E" />
        <path d="M 22 13 L 44 24 L 22 35 L 0 24 Z" fill="#F0EDE6" stroke="#1C1917" strokeWidth="2" />
        <path d="M 22 18 L 35 24.5 L 22 31 L 9 24.5 Z" fill="#EAB308" />
        <Label x={6} y={70} align="start">clients</Label>
      </g>

      <g transform="translate(400 238)">
        <path d="M 0 42 L 28 56 L 56 42 L 28 28 Z" fill="#F0EDE6" stroke="#1C1917" strokeWidth="2" />
        <path d="M 0 42 L 0 8 L 28 -6 L 28 28 Z" fill="#1C1917" />
        <path d="M 5 34 L 5 14 L 23 5 L 23 25 Z" fill="#EAB308" />
        <Label x={56} y={70} align="end">supervision</Label>
      </g>

      {/* Légende */}
      <g fontFamily="var(--font-geist-mono), monospace" fontSize="10.5" fill="#57534E">
        <rect x="150" y="440" width="6" height="6" fill="#15803D" />
        <text x="162" y="447">internet redondant → routeurs/AP</text>
      </g>
    </svg>
  );
}
