import type { GeoIconName } from "./content";

/*
 * Icônes géométriques abstraites du design system Bitume.
 * Deux encres seulement : currentColor (structure) + moutarde (accent).
 * Traits 2px, formes élémentaires — jamais d'icône figurative détaillée.
 */
export default function GeoIcon({
  name,
  className = "h-8 w-8",
  accent = "#EAB308",
}: {
  name: GeoIconName;
  className?: string;
  accent?: string;
}) {
  const common = {
    className,
    viewBox: "0 0 32 32",
    fill: "none",
    "aria-hidden": true as const,
  };
  const s = { stroke: "currentColor", strokeWidth: 2 };

  switch (name) {
    case "billing": // pièce + pile de valeur
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" {...s} />
          <circle cx="12" cy="12" r="3" fill={accent} />
          <rect x="18" y="18" width="10" height="4" fill={accent} />
          <rect x="18" y="24" width="10" height="4" {...s} />
        </svg>
      );
    case "monitor": // impulsion dans un cadre
      return (
        <svg {...common}>
          <rect x="3" y="5" width="26" height="18" {...s} />
          <path d="M6 16h6l3-6 4 10 3-4h4" stroke={accent} strokeWidth="2" />
          <rect x="12" y="27" width="8" height="2" fill="currentColor" />
        </svg>
      );
    case "plug": // deux barres + connecteur
      return (
        <svg {...common}>
          <rect x="4" y="13" width="10" height="6" fill={accent} />
          <rect x="18" y="13" width="10" height="6" {...s} />
          <path d="M14 16h4" {...s} />
          <path d="M9 8v5M23 19v5" {...s} />
        </svg>
      );
    case "cloud": // grille suspendue
      return (
        <svg {...common}>
          <rect x="5" y="5" width="22" height="14" {...s} />
          <path d="M5 12h22M12 5v14M20 5v14" {...s} />
          <rect x="9" y="23" width="4" height="4" fill={accent} />
          <rect x="19" y="23" width="4" height="4" fill="currentColor" />
        </svg>
      );
    case "users": // trois modules
      return (
        <svg {...common}>
          <rect x="4" y="4" width="10" height="10" {...s} />
          <rect x="18" y="4" width="10" height="10" fill={accent} />
          <rect x="11" y="18" width="10" height="10" {...s} />
        </svg>
      );
    case "growth": // barres ascendantes
      return (
        <svg {...common}>
          <rect x="4" y="20" width="6" height="8" fill="currentColor" />
          <rect x="13" y="13" width="6" height="15" fill="currentColor" />
          <rect x="22" y="5" width="6" height="23" fill={accent} />
        </svg>
      );
    case "radius": // noyau rayonnant
      return (
        <svg {...common}>
          <circle cx="16" cy="16" r="4" fill={accent} />
          <circle cx="16" cy="16" r="9" {...s} />
          <path d="M16 2v5M16 25v5M2 16h5M25 16h5" {...s} />
        </svg>
      );
    case "agent": // point de vente / échange
      return (
        <svg {...common}>
          <rect x="4" y="4" width="12" height="12" {...s} />
          <rect x="16" y="16" width="12" height="12" fill={accent} />
          <path d="M16 10h9v6M16 22H7v-6" {...s} />
        </svg>
      );
    case "voucher": // ticket cranté
      return (
        <svg {...common}>
          <path d="M4 8h24v6a3 3 0 0 0 0 6v4H4v-4a3 3 0 0 0 0-6V8Z" {...s} />
          <path d="M12 8v16" stroke={accent} strokeWidth="2" strokeDasharray="3 3" />
        </svg>
      );
    case "router": // boîtier + antennes
      return (
        <svg {...common}>
          <rect x="4" y="18" width="24" height="9" {...s} />
          <path d="M9 18V8M23 18V8" {...s} />
          <circle cx="9" cy="6" r="2" fill={accent} />
          <circle cx="23" cy="6" r="2" fill={accent} />
          <rect x="8" y="21" width="3" height="3" fill={accent} />
          <rect x="14" y="21" width="3" height="3" fill="currentColor" />
        </svg>
      );
    case "wifi": // arcs de signal carrés
      return (
        <svg {...common}>
          <path d="M6 14a14 14 0 0 1 20 0" {...s} />
          <path d="M10 19a9 9 0 0 1 12 0" {...s} />
          <rect x="14" y="22" width="4" height="4" fill={accent} />
        </svg>
      );
    case "globe": // méridiens
      return (
        <svg {...common}>
          <circle cx="16" cy="16" r="12" {...s} />
          <ellipse cx="16" cy="16" rx="5" ry="12" {...s} />
          <path d="M4 16h24" stroke={accent} strokeWidth="2" />
        </svg>
      );
  }
}
