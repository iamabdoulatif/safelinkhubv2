export const ROUTER_REPLACEMENT_STATUSES = [
  "pending",
  "installing",
  "completed",
  "cancelled",
  "failed",
] as const;

export type RouterReplacementStatus = (typeof ROUTER_REPLACEMENT_STATUSES)[number];
export type ReplacementTunnelMethod = "vpn" | "openvpn";

export function canStartRouterReplacement(status: string | null | undefined): boolean {
  return status === null || status === undefined || status === "completed" || status === "cancelled";
}

export function canRetryReplacement(status: string | null | undefined): boolean {
  return status === "pending" || status === "failed";
}

export function isReplacementAutoSetupRetry(
  authorizationStatus: string,
  paidByUserId: string | null,
  currentUserId: string,
  replacementStatus: string,
): boolean {
  return (
    authorizationStatus === "approved" &&
    paidByUserId === currentUserId &&
    (replacementStatus === "pending" ||
      replacementStatus === "installing" ||
      replacementStatus === "completed" ||
      replacementStatus === "failed")
  );
}

export function buildReplacementInstallCommand(
  scriptUrl: string,
  installToken: string,
  method: ReplacementTunnelMethod = "vpn",
): string {
  const fileName = method === "openvpn" ? "ovpn.rsc" : "vpn.rsc";
  const preamble =
    method === "vpn"
      ? "/interface/ethernet/set [find name=ether1] name=E1-WAN-FAI; /interface/wifi/set [find] disabled=no; "
      : "";
  const fetchMode = scriptUrl.startsWith("https://") ? "https" : "http";
  return `${preamble}/tool fetch url="${scriptUrl}" http-header-field="Authorization: Bearer ${installToken}" dst-path="${fileName}" mode=${fetchMode}; :delay 2s; /import file-name="${fileName}"; :delay 1s; /file remove "${fileName}"`;
}

export function replacementCompletionPlan(method: ReplacementTunnelMethod) {
  return [
    "replace-forwards",
    "move-records",
    method === "vpn" ? "revoke-wireguard-peer" : "revoke-openvpn-peer",
    "complete",
  ] as const;
}

export function replacementStatusLabel(status: string | null | undefined, needsMikhmon: boolean): string {
  if (status === "pending") return "Script de remplacement prêt";
  if (status === "installing") return "Connexion du routeur de remplacement…";
  if (status === "failed") return "Reprise à relancer";
  if (status === "cancelled") return "Reprise annulée";
  if (status === "completed" && needsMikhmon) return "Préparation MikHmon requise";
  if (status === "completed") return "Accès transférés";
  return "Aucune reprise en cours";
}

export function formatVpnAccessWhatsappMessage(input: {
  routerName: string;
  username: string | null;
  password: string | null;
  services: string[];
}): string {
  const serviceNames = input.services
    .map((service) => {
      if (service === "mikhmon") return "MikHmon";
      if (service === "winbox") return "WinBox";
      if (service === "webfig") return "WebFig";
      if (service === "ssh") return "SSH / SFTP";
      return service;
    })
    .join(", ");
  return [
    "*Accès distant SafeLinkHub*",
    `Routeur : ${input.routerName}`,
    `Services : ${serviceNames || "—"}`,
    `Identifiant : ${input.username || "—"}`,
    input.password ? `Mot de passe : ${input.password}` : "Mot de passe : à transmettre séparément",
  ].join("\n");
}
