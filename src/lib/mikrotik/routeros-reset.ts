// Réinitialiser RouterOS avec PLUSIEURS modes : logique PURE (données + args),
// sans client ni I/O, pour être testable et partagée entre le dialogue et
// l'action serveur (reset-job-actions côté actions.ts).
//
// `/system/reset-configuration` a des variantes qui ne détruisent pas pareil :
//   - no-defaults=yes            → efface TOUT, aucune config (routeur nu) ;
//   - no-defaults=yes keep-users → efface la config mais garde les comptes ;
//   - (par défaut)               → efface puis repose la config d'usine MikroTik.
// Les trois COUPENT le tunnel SafeLinkHub : après coup le routeur n'est plus
// joignable que localement, à re-provisionner. C'est pourquoi chaque mode exige
// de recopier le nom (geste irréversible, aucune sauvegarde ne le rattrape).

export type ResetMode = "factory" | "keep-users" | "defaults";

export type ResetModeSpec = {
  key: ResetMode;
  /** Libellé du choix. */
  label: string;
  /** Une phrase : ce que ce mode fait de particulier. */
  resume: string;
  /** Ce qui SURVIT sur l'appareil, propre à ce mode. */
  conserve: string[];
  /** Arguments passés à /system/reset-configuration (sans la commande). */
  args: string[];
};

export const RESET_MODES: ResetModeSpec[] = [
  {
    key: "factory",
    label: "Usine complète (routeur nu)",
    resume:
      "Efface toute la configuration RouterOS sans rien reposer : le routeur redémarre vierge, joignable seulement par MAC (Winbox) ou sur son adresse d'usine.",
    conserve: [],
    args: ["=no-defaults=yes"],
  },
  {
    key: "keep-users",
    label: "En gardant les comptes",
    resume:
      "Efface la configuration mais conserve les comptes RouterOS (identifiants admin) : pratique pour reprendre la main localement après coup.",
    conserve: ["Les comptes et mots de passe RouterOS (login admin)."],
    args: ["=no-defaults=yes", "=keep-users=yes"],
  },
  {
    key: "defaults",
    label: "Config d'usine RouterOS",
    resume:
      "Efface la configuration puis repose la config par défaut de MikroTik (DHCP/LAN d'usine) : le routeur redémarre avec un réseau local fonctionnel.",
    conserve: ["La configuration d'usine MikroTik (LAN/DHCP par défaut)."],
    args: [],
  },
];

export function resetModeSpec(mode: ResetMode): ResetModeSpec {
  return RESET_MODES.find((m) => m.key === mode) ?? RESET_MODES[0];
}

export function isResetMode(v: unknown): v is ResetMode {
  return typeof v === "string" && RESET_MODES.some((m) => m.key === v);
}

/** Effets communs à TOUTE réinitialisation — ce que les trois détruisent. */
export const RESET_COMMON_EFFECTS: string[] = [
  "Toute la configuration SafeLinkHub : hotspot, bridges, WiFi, tunnel, conteneur MikHmon.",
  "Les tickets présents sur l'appareil disparaissent avec elle.",
  "Le tunnel tombe : le routeur sort du parc (hors-ligne), à re-provisionner.",
];

/** Arguments complets de la commande pour un mode donné. */
export function resetCommand(mode: ResetMode): string[] {
  return ["/system/reset-configuration", ...resetModeSpec(mode).args];
}
