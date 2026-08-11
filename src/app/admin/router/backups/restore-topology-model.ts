import type { ChannelState, TopologyChannel, TopologyNode } from "./RestoreTopology";

/**
 * Traduit le plan de restauration en canaux de la topologie. Fonction pure et
 * séparée du rendu : c'est ici que se décide ce que l'admin croit qu'il va se
 * passer, donc c'est ici que ça se teste.
 */
export type PlanLike = {
  identity: { from: string | null; to: string | null; willApply: boolean };
  wifi: { ssid: string | null; sourceApi: string | null; targetApi: string; radios: string[]; translated: boolean };
  data: { tickets: number; profiles: number; walledGarden: number };
  /** Absent sur les jobs enregistrés avant l'ajout de cette vérification. */
  hotspot?: { server: string | null; addressPool: string | null; validated: boolean };
  portal: { templateId: string | null; templateName: string | null; willReinstall: boolean };
  blockers: string[];
};

export type BackupLike = {
  routerName: string;
  model: string | null;
  counts: Record<string, number>;
};

export type TargetLike = { name: string; model: string | null; status: string };

const nf = new Intl.NumberFormat("fr-FR");

export function sourceNode(backup: BackupLike): TopologyNode {
  return {
    title: backup.routerName,
    subtitle: backup.model ?? "modèle inconnu",
    meta: `${nf.format(backup.counts.hotspotUsers ?? 0)} tickets sauvegardés`,
  };
}

export function targetNode(target: TargetLike): TopologyNode {
  return {
    title: target.name,
    subtitle: target.model ?? "modèle inconnu",
    meta: target.status === "online" ? "en ligne" : target.status,
  };
}

/**
 * Sans plan (avant le scan), tout est "idle" : on montre CE QUI TRAVERSERA sans
 * rien affirmer — le matériel n'a pas encore été lu.
 *
 * `done` n'est employé qu'après une restauration RÉELLE. Une simulation laisse
 * les canaux en "planned" : laisser croire que c'est fait alors que rien n'a été
 * écrit serait le pire des mensonges pour cet écran.
 */
export function buildTopologyChannels(
  backup: BackupLike,
  plan: PlanLike | null,
  phase: "idle" | "planned" | "done" | "failed",
): TopologyChannel[] {
  const tickets = backup.counts.hotspotUsers ?? 0;
  const profiles = backup.counts.hotspotUserProfiles ?? 0;

  if (!plan) {
    return [
      { key: "identity", label: "Identité", detail: "nom RouterOS", state: "idle" },
      { key: "wifi", label: "WiFi", detail: "SSID du réseau", state: "idle" },
      {
        key: "data",
        label: "Tickets & profils",
        detail: `${nf.format(tickets)} tickets · ${profiles} profils`,
        state: "idle",
      },
      { key: "portal", label: "Portail captif", detail: "fichiers + forfaits", state: "idle" },
    ];
  }

  // Un blocage vaut pour toute la reprise : rien ne sera écrit tant qu'il tient.
  const blocked = plan.blockers.length > 0;
  const base: ChannelState = blocked
    ? "blocked"
    : phase === "done"
      ? "done"
      : phase === "failed"
        ? "failed"
        : "planned";

  const wifiState: ChannelState = blocked
    ? "blocked"
    : plan.wifi.targetApi === "none" || !plan.wifi.ssid
      ? "skipped"
      : base;

  const portalState: ChannelState = blocked
    ? "blocked"
    : plan.portal.willReinstall
      ? base
      : "skipped";

  return [
    {
      key: "identity",
      label: "Identité",
      detail: plan.identity.willApply
        ? `${plan.identity.from ?? "?"} → ${plan.identity.to ?? "?"}`
        : `déjà « ${plan.identity.to ?? "?"} »`,
      state: blocked ? "blocked" : plan.identity.willApply ? base : "skipped",
    },
    {
      key: "wifi",
      label: "WiFi",
      detail:
        plan.wifi.targetApi === "none"
          ? "aucune radio sur le rechange"
          : !plan.wifi.ssid
            ? "aucun SSID sauvegardé"
            : plan.wifi.translated
              ? `« ${plan.wifi.ssid} » · ${plan.wifi.sourceApi} → ${plan.wifi.targetApi}`
              : `« ${plan.wifi.ssid} » · ${plan.wifi.radios.join(", ") || "—"}`,
      state: wifiState,
    },
    {
      key: "data",
      label: "Tickets & profils",
      detail: `${nf.format(tickets)} tickets · ${profiles} profils · ${
        plan.hotspot?.validated
          ? `${plan.hotspot.server} → ${plan.hotspot.addressPool}`
          : "liaison HotSpot non validée"
      }`,
      state: base,
    },
    {
      key: "portal",
      label: "Portail captif",
      detail: plan.portal.willReinstall
        ? `${plan.portal.templateName} · réinstallé`
        : "modèle inconnu — à installer à la main",
      state: portalState,
    },
  ];
}
