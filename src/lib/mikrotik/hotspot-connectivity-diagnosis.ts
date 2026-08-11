// « Pourquoi ce ticket ne se connecte pas ? » — diagnostic LECTURE SEULE.
//
// Module « plain », sans "use server" : aucune de ces fonctions n'a à devenir
// un endpoint appelable.
//
// POURQUOI IL EXISTE : un ticket qui ne passe pas peut être refusé pour des
// raisons qui n'ont rien à voir avec le ticket. Sur HSPT-YAHYA-GBEMA, le code
// 5jyw82 était parfaitement sain — activé, profil valide, pool existant, aucun
// verrouillage MAC — et pourtant inutilisable. Les sauvegardes ne capturent ni
// les sessions actives, ni les baux, ni le journal : impossible de trancher
// sans ouvrir Winbox. Ce module va chercher exactement ces trois choses.
//
// Il n'écrit RIEN. Les causes possibles (pool saturé, session déjà ouverte,
// cookie MAC qui reconnecte sous un ancien ticket) se corrigent différemment,
// et certaines relèvent d'un choix produit — le mac-cookie est délibéré, voir
// hotspot-login-mode.ts. On constate, on n'arbitre pas à la place de
// l'opérateur.

import type { RouterOSClient } from "./client";
import { HOTSPOT_POOL_NAME } from "./constants";

/** Taille d'une plage RouterOS « a.b.c.d-e.f.g.h[,…] », en nombre d'adresses. */
export function poolRangeSize(ranges: string | undefined): number {
  if (!ranges) return 0;
  const toInt = (ip: string) =>
    ip.trim().split(".").reduce((acc, octet) => acc * 256 + Number(octet), 0);
  let total = 0;
  for (const part of ranges.split(",")) {
    const [from, to] = part.split("-");
    if (!from) continue;
    total += to ? toInt(to) - toInt(from) + 1 : 1;
  }
  return total;
}

export type TicketDiagnosis = {
  found: boolean;
  disabled: boolean;
  /** Le profil référencé par le ticket existe-t-il sur le routeur ? */
  profileExists: boolean;
  profile: string;
  /** Commentaire MikHmon : « vc-… » = jamais activé, une date = déjà utilisé. */
  neverUsed: boolean;
  comment: string;
  /** Verrouillage MAC résiduel (le bug corrigé en v185). */
  boundMac: string | null;
  /** Session hotspot déjà ouverte avec ce code — bloquante si shared-users=1. */
  activeSession: boolean;
};

export type HotspotConnectivityDiagnosis = {
  pool: { name: string; ranges: string; total: number; used: number; saturation: number } | null;
  activeSessions: number;
  macCookies: number;
  /** `mac`/`mac-cookie` dans login-by : un appareil peut revenir sans code. */
  macLoginEnabled: boolean;
  loginBy: string;
  ticket: TicketDiagnosis | null;
  /** Dernières lignes de journal mentionnant le hotspot — la raison exacte. */
  recentLog: string[];
  /** Constats classés, du plus probable au moins probable. */
  findings: string[];
};

export async function diagnoseHotspotConnectivity(
  client: RouterOSClient,
  code: string | null,
  timeoutMs = 20000,
): Promise<HotspotConnectivityDiagnosis> {
  const safe = async <T>(words: string[], fallback: T): Promise<T> =>
    (await client.talk(words, timeoutMs).catch(() => fallback)) as T;
  const empty: Record<string, string>[] = [];

  // ── Capacité d'adressage ────────────────────────────────────────────────
  const pools = await safe(["/ip/pool/print", `?name=${HOTSPOT_POOL_NAME}`], empty);
  const poolRow = pools[0];
  const used = poolRow ? await safe(["/ip/pool/used/print"], empty) : empty;
  const usedHere = used.filter((row) => (row.pool ?? "") === HOTSPOT_POOL_NAME).length;
  const total = poolRangeSize(poolRow?.ranges);
  const pool = poolRow
    ? {
        name: HOTSPOT_POOL_NAME,
        ranges: poolRow.ranges ?? "",
        total,
        used: usedHere,
        saturation: total > 0 ? Math.round((usedHere / total) * 100) : 0,
      }
    : null;

  // ── Sessions et cookies ─────────────────────────────────────────────────
  const active = await safe(["/ip/hotspot/active/print"], empty);
  const cookies = await safe(["/ip/hotspot/cookie/print"], empty);

  const servers = await safe(["/ip/hotspot/print"], empty);
  const serverProfiles = await safe(["/ip/hotspot/profile/print"], empty);
  const activeProfile = serverProfiles.find((p) => p.name === servers[0]?.profile);
  const loginBy = activeProfile?.["login-by"] ?? "";
  const macLoginEnabled = /(^|,)mac(,|$)|mac-cookie/.test(loginBy);

  // ── Le ticket lui-même ──────────────────────────────────────────────────
  let ticket: TicketDiagnosis | null = null;
  if (code) {
    const users = await safe(["/ip/hotspot/user/print", `?name=${code}`], empty);
    const user = users[0];
    if (!user) {
      ticket = {
        found: false,
        disabled: false,
        profileExists: false,
        profile: "",
        neverUsed: false,
        comment: "",
        boundMac: null,
        activeSession: false,
      };
    } else {
      const profileName = user.profile ?? "";
      const userProfiles = await safe(
        ["/ip/hotspot/user/profile/print", `?name=${profileName}`],
        empty,
      );
      const comment = user.comment ?? "";
      const mac = (user["mac-address"] ?? "").trim();
      ticket = {
        found: true,
        disabled: (user.disabled ?? "") === "true",
        profileExists: userProfiles.length > 0,
        profile: profileName,
        // Convention MikHmon : le commentaire vaut « vc-… »/« up-… » tant que
        // le ticket n'a jamais servi ; l'on-login le remplace par la date
        // d'expiration à la première connexion.
        neverUsed: /^(vc|up)/i.test(comment) || comment === "",
        comment,
        boundMac: mac && mac !== "00:00:00:00:00:00" ? mac : null,
        activeSession: active.some((a) => (a.user ?? "") === code),
      };
    }
  }

  // ── Journal : la raison écrite par RouterOS lui-même ────────────────────
  const log = await safe(["/log/print"], empty);
  const recentLog = log
    .filter((row) => /hotspot/i.test(`${row.topics ?? ""} ${row.message ?? ""}`))
    .slice(-12)
    .map((row) => `${row.time ?? ""} ${row.message ?? ""}`.trim());

  // ── Constats, du plus probable au moins probable ────────────────────────
  const findings: string[] = [];
  if (ticket && !ticket.found) {
    findings.push(`Le code « ${code} » n'existe pas sur ce routeur.`);
  }
  if (ticket?.disabled) findings.push("Le ticket est DÉSACTIVÉ sur le routeur.");
  if (ticket?.found && !ticket.profileExists) {
    findings.push(
      `Le profil « ${ticket.profile} » du ticket n'existe plus : RouterOS refuse une connexion vers un profil inconnu.`,
    );
  }
  if (ticket?.boundMac) {
    findings.push(
      `Ticket épinglé au MAC ${ticket.boundMac} — il ne fonctionnera que depuis cet appareil. Utilisez « Délier les tickets MAC ».`,
    );
  }
  if (ticket?.activeSession) {
    findings.push(
      "Une session est DÉJÀ ouverte avec ce code. Avec shared-users=1, un second appareil est refusé tant qu'elle dure.",
    );
  }
  if (pool && pool.saturation >= 90) {
    findings.push(
      `Pool d'adresses saturé à ${pool.saturation}% (${pool.used}/${pool.total}). Sans IP libre, le client n'atteint même pas le portail — le ticket semble « refusé » alors qu'il n'a jamais été soumis.`,
    );
  } else if (pool && pool.saturation >= 70) {
    findings.push(
      `Pool d'adresses à ${pool.saturation}% (${pool.used}/${pool.total}) — pas encore bloquant, mais à surveiller aux heures de pointe.`,
    );
  }
  if (macLoginEnabled && cookies.length > 0) {
    findings.push(
      `${cookies.length} cookie(s) MAC actifs : un appareil déjà venu peut être reconnecté automatiquement sous son ANCIEN ticket, sans qu'on lui demande le nouveau code. C'est le comportement voulu (login-by contient « ${loginBy} ») — mais il explique un « mon nouveau code ne sert à rien ».`,
    );
  }
  if (findings.length === 0) {
    findings.push(
      "Aucune cause évidente côté routeur : ticket sain, pool disponible, aucune session bloquante. Regardez le journal ci-dessous au moment d'un essai réel.",
    );
  }

  return {
    pool,
    activeSessions: active.length,
    macCookies: cookies.length,
    macLoginEnabled,
    loginBy,
    ticket,
    recentLog,
    findings,
  };
}
