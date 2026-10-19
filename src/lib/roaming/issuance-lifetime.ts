export const ROAMING_ISSUANCE_DEADLINE_MS = 5 * 60_000;
export const ROAMING_RECOVERY_AFTER_MS = 10 * 60_000;
export function roamingIssuanceIsLive(
  status: string,
  createdAt: Date | string | undefined,
  now = Date.now(),
) {
  if (status !== "PROVISIONING") return false;
  const created = createdAt ? new Date(createdAt).getTime() : NaN;
  return !Number.isFinite(created) || now - created < ROAMING_RECOVERY_AFTER_MS;
}
