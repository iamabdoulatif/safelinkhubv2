import { createHash } from "crypto";

export const API_USERNAME = "safelinkhub-api";
// 2h — provisioning is manual (an operator copies the command, walks to the
// board, pastes it into WinBox/WebFig), so the previous 30 min window often
// expired mid-setup and forced regenerating the command. Gates install-vpn,
// install-openvpn and bootstrap token expiry alike.
export const INSTALL_TOKEN_TTL_MS = 2 * 60 * 60 * 1000;

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
