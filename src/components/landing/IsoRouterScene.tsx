/*
 * Scène isométrique animée — routeur MikroTik stylisé Bitume.
 * Pseudo-3D en aplats opaques (aucun dégradé), animée en CSS pur :
 * paquets de données le long des câbles, LED clignotantes, ondes de signal.
 */

const CABLE_LEFT = "M 250 248 C 200 290, 150 300, 108 322";
const CABLE_RIGHT = "M 300 242 C 350 282, 392 294, 424 312";

export default function IsoRouterScene({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 520 400"
      className={className}
      role="img"
      aria-label="Routeur MikroTik connecté à des appareils clients, avec paquets de données animés"
    >
      {/* Cercles concentriques décoratifs */}
      <circle cx="260" cy="200" r="180" stroke="#D8D2C6" strokeWidth="2" fill="none" />
      <circle cx="260" cy="200" r="132" stroke="#D8D2C6" strokeWidth="2" fill="none" />
      <path
        d="M 260 20 A 180 180 0 0 1 440 200"
        stroke="#EAB308"
        strokeWidth="3"
        fill="none"
      />

      {/* Câbles réseau */}
      <path d={CABLE_LEFT} stroke="#1C1917" strokeWidth="2.5" fill="none" />
      <path d={CABLE_RIGHT} stroke="#1C1917" strokeWidth="2.5" fill="none" />

      {/* Paquets de données (aller en moutarde, retour en encre) */}
      <rect
        className="iso-packet"
        width="9"
        height="9"
        x="-4.5"
        y="-4.5"
        fill="#EAB308"
        stroke="#1C1917"
        strokeWidth="1.5"
        style={{ offsetPath: `path('${CABLE_LEFT}')` }}
      />
      <rect
        className="iso-packet"
        width="7"
        height="7"
        x="-3.5"
        y="-3.5"
        fill="#1C1917"
        style={{
          offsetPath: `path('${CABLE_LEFT}')`,
          animationDelay: "1.4s",
          animationDirection: "reverse",
        }}
      />
      <rect
        className="iso-packet"
        width="9"
        height="9"
        x="-4.5"
        y="-4.5"
        fill="#EAB308"
        stroke="#1C1917"
        strokeWidth="1.5"
        style={{ offsetPath: `path('${CABLE_RIGHT}')`, animationDelay: "0.7s" }}
      />
      <rect
        className="iso-packet"
        width="7"
        height="7"
        x="-3.5"
        y="-3.5"
        fill="#1C1917"
        style={{
          offsetPath: `path('${CABLE_RIGHT}')`,
          animationDelay: "2.1s",
          animationDirection: "reverse",
        }}
      />

      {/* ── Routeur (bloc isométrique flottant) ── */}
      <g className="iso-float">
        {/* Antennes */}
        <path d="M 302 152 V 84" stroke="#1C1917" strokeWidth="4" />
        <path d="M 334 168 V 100" stroke="#1C1917" strokeWidth="4" />
        <circle cx="302" cy="80" r="5" fill="#EAB308" stroke="#1C1917" strokeWidth="2" />
        <circle cx="334" cy="96" r="5" fill="#EAB308" stroke="#1C1917" strokeWidth="2" />
        {/* Ondes de signal */}
        <circle className="iso-wave" cx="302" cy="80" r="16" stroke="#EAB308" strokeWidth="2.5" fill="none" />
        <circle
          className="iso-wave"
          cx="334"
          cy="96"
          r="16"
          stroke="#EAB308"
          strokeWidth="2.5"
          fill="none"
          style={{ animationDelay: "1.2s" }}
        />

        {/* Face gauche */}
        <path d="M 170 170 L 260 215 L 260 251 L 170 206 Z" fill="#1C1917" />
        {/* Face droite */}
        <path d="M 260 215 L 350 170 L 350 206 L 260 251 Z" fill="#57534E" />
        {/* Face supérieure */}
        <path
          d="M 260 125 L 350 170 L 260 215 L 170 170 Z"
          fill="#F0EDE6"
          stroke="#1C1917"
          strokeWidth="2"
        />
        {/* Bande moutarde sur la face supérieure */}
        <path d="M 296 143 L 332 161 L 296 179 L 260 161 Z" fill="#EAB308" />

        {/* Ports Ethernet (face gauche) — parallélogrammes suivant la pente iso */}
        <path d="M 182 185 l 9 4.5 l 0 9 l -9 -4.5 Z" fill="#FBFAF8" />
        <path d="M 198 193 l 9 4.5 l 0 9 l -9 -4.5 Z" fill="#FBFAF8" />
        <path d="M 214 201 l 9 4.5 l 0 9 l -9 -4.5 Z" fill="#FBFAF8" />

        {/* LED de statut (face droite) */}
        <path className="iso-led" d="M 278 234 l 6 -3 l 0 6 l -6 3 Z" fill="#EAB308" />
        <path
          className="iso-led"
          d="M 294 226 l 6 -3 l 0 6 l -6 3 Z"
          fill="#EAB308"
          style={{ animationDelay: "0.5s" }}
        />
        <path
          className="iso-led"
          d="M 310 218 l 6 -3 l 0 6 l -6 3 Z"
          fill="#FBFAF8"
          style={{ animationDelay: "0.9s" }}
        />
      </g>

      {/* ── Téléphone client (gauche) ── */}
      <g>
        <path d="M 73 322 L 95 333 L 95 352 L 73 341 Z" fill="#1C1917" />
        <path d="M 95 333 L 117 322 L 117 341 L 95 352 Z" fill="#57534E" />
        <path d="M 95 311 L 117 322 L 95 333 L 73 322 Z" fill="#F0EDE6" stroke="#1C1917" strokeWidth="2" />
        <path d="M 95 316 L 108 322.5 L 95 329 L 82 322.5 Z" fill="#EAB308" />
      </g>

      {/* ── Ordinateur portable client (droite) ── */}
      <g>
        {/* Base */}
        <path d="M 400 314 L 428 328 L 456 314 L 428 300 Z" fill="#F0EDE6" stroke="#1C1917" strokeWidth="2" />
        {/* Écran relevé */}
        <path d="M 400 314 L 400 278 L 428 264 L 428 300 Z" fill="#1C1917" />
        <path d="M 404 306 L 404 284 L 424 274 L 424 296 Z" fill="#EAB308" />
      </g>

      {/* Étiquette technique */}
      <g fontFamily="var(--font-geist-mono), monospace" fontSize="11" fill="#57534E">
        <text x="150" y="378">routeros · api-ssl · 8728</text>
        <rect x="138" y="370" width="6" height="6" fill="#15803D" />
      </g>
    </svg>
  );
}
