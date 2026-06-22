import { createHash } from "crypto";

export const API_USERNAME = "safelinkhub-api";
export const INSTALL_TOKEN_TTL_MS = 30 * 60 * 1000;

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
