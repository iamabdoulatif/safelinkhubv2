// Pourquoi le portail s'ouvre sur un AVERTISSEMENT DE SÉCURITÉ sur Android.
//
// Cas réel (YAHYA WIFI) : au clic sur un forfait, le mini-navigateur Android
// affiche « Le réseau que vous essayez de rejoindre présente des problèmes de
// sécurité… la page de connexion peut ne pas appartenir à l'organisation
// représentée », puis « Continuer quand même dans le navigateur » mène à une
// page d'erreur.
//
// Ce message n'est PAS produit par SafeLinkHub : c'est l'écran d'erreur TLS du
// mini-navigateur captif (CaptivePortalLogin). Il s'affiche quand la page de
// connexion est servie en HTTPS avec un certificat que le téléphone refuse —
// et sur un hotspot, ce certificat est presque toujours auto-signé, donc
// toujours refusé. Deux réglages du routeur produisent cette page :
//
//   1. le PROFIL HOTSPOT porte un `ssl-certificate` (ou `https` dans
//      `login-by`) : RouterOS bascule alors `$(link-login-only)` en
//      `https://<dns-name>/login`, et tout envoi du formulaire de connexion
//      tombe sur le certificat ;
//   2. le service `www-ssl` (WebFig en TLS) écoute sur 443 : n'importe quelle
//      requête HTTPS d'un client pas encore authentifié — y compris celle que
//      le navigateur tente tout seul en « upgrade » depuis http:// — reçoit le
//      certificat du routeur, émis pour le routeur et jamais pour le domaine
//      du portail.
//
// Un portail captif se sert en clair, sur un réseau où le client n'a de toute
// façon pas encore d'accès : le HTTPS n'y protège rien et casse l'ouverture
// automatique. On CONSTATE ici ; la correction est un bouton, pas un effet de
// bord (l'exploitant peut avoir posé un vrai certificat).

/** Ligne RouterOS générique. */
type Row = Record<string, string | undefined>;

export type PortalTlsProfile = {
  id: string;
  name: string;
  /** Certificat posé sur le profil ("none"/vide = aucun). */
  certificate: string;
  /** `login-by` d'origine. */
  loginBy: string;
  /** `login-by` sans `https` — ce que le correctif écrira. */
  loginByHttp: string;
};

export type PortalTlsState = {
  /** Profils hotspot ACTIFS qui servent la page de connexion en HTTPS. */
  profiles: PortalTlsProfile[];
  /** Service WebFig TLS allumé (répond en 443 avec le certificat du routeur). */
  wwwSsl: { id: string; port: string } | null;
};

function isDisabled(row: Row): boolean {
  return String(row.disabled ?? "").trim().toLowerCase() === "true";
}

function hasCertificate(value: string | undefined): boolean {
  const v = String(value ?? "").trim().toLowerCase();
  return v !== "" && v !== "none";
}

function splitLoginBy(raw: string | undefined): string[] {
  return String(raw ?? "")
    .split(",")
    .map((m) => m.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Ce qui, sur ce routeur, peut servir du TLS à un client pas encore
 * authentifié. Ne regarde QUE les profils rattachés à un serveur hotspot
 * actif : un profil orphelin ne sert aucune page.
 */
export function inspectPortalTls(
  hotspotServers: Row[],
  hotspotProfiles: Row[],
  ipServices: Row[],
): PortalTlsState {
  const actifs = new Set(
    hotspotServers.filter((s) => !isDisabled(s) && s.profile).map((s) => String(s.profile)),
  );

  const profiles: PortalTlsProfile[] = [];
  for (const profile of hotspotProfiles) {
    const id = profile[".id"];
    const name = profile.name;
    if (!id || !name || !actifs.has(name)) continue;
    const methodes = splitLoginBy(profile["login-by"]);
    const enHttps = methodes.includes("https") || hasCertificate(profile["ssl-certificate"]);
    if (!enHttps) continue;
    const sansHttps = methodes.filter((m) => m !== "https");
    profiles.push({
      id,
      name,
      certificate: String(profile["ssl-certificate"] ?? "").trim(),
      loginBy: String(profile["login-by"] ?? "").trim(),
      // Jamais vide : un profil sans aucune méthode n'authentifierait plus
      // personne, ce qui serait un dégât bien pire que l'avertissement TLS.
      loginByHttp: (sansHttps.length > 0 ? sansHttps : ["cookie", "http-chap", "http-pap"]).join(","),
    });
  }

  const ssl = ipServices.find((s) => s.name === "www-ssl" && !isDisabled(s));
  return {
    profiles,
    wwwSsl: ssl?.[".id"] ? { id: ssl[".id"], port: String(ssl.port ?? "443") } : null,
  };
}

export function portalTlsBroken(state: PortalTlsState): boolean {
  return state.profiles.length > 0 || state.wwwSsl !== null;
}

/** Phrase du constat — dit CE QUI est allumé, pas seulement qu'il y a un souci. */
export function portalTlsDetail(state: PortalTlsState): string {
  const causes: string[] = [];
  for (const p of state.profiles) {
    causes.push(
      p.certificate && p.certificate.toLowerCase() !== "none"
        ? `le profil « ${p.name} » sert la page de connexion en HTTPS (certificat « ${p.certificate} »)`
        : `le profil « ${p.name} » annonce HTTPS dans login-by`,
    );
  }
  if (state.wwwSsl) {
    causes.push(
      `le service www-ssl écoute sur le port ${state.wwwSsl.port} et répond à toute requête HTTPS avec le certificat du routeur`,
    );
  }
  return (
    `${causes.join(" ; ")}. Sur Android, le mini-navigateur du portail refuse ce certificat ` +
    "— il n'est pas émis pour le domaine du portail — et affiche « problèmes de sécurité » " +
    "au lieu de la page. Le correctif repasse le portail en HTTP : sur un réseau captif, " +
    "le client n'a pas encore d'accès à protéger, et le paiement se fait de toute façon " +
    "sur safelinkhub.io en HTTPS."
  );
}

/** Commandes de remise en HTTP, dans l'ordre. Vide si rien à corriger. */
export function portalTlsRepairCommands(state: PortalTlsState): string[][] {
  const cmds: string[][] = [];
  for (const p of state.profiles) {
    cmds.push([
      "/ip/hotspot/profile/set",
      `=numbers=${p.id}`,
      "=ssl-certificate=none",
      `=login-by=${p.loginByHttp}`,
    ]);
  }
  if (state.wwwSsl) {
    cmds.push(["/ip/service/set", `=numbers=${state.wwwSsl.id}`, "=disabled=yes"]);
  }
  return cmds;
}
