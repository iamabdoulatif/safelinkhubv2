/** Issuance may spend time on routers: validate the snapshot again under DB locks. */
export type ProfileSnapshot = {
  durationValue: number;
  durationUnit: string;
  uploadMbps: number;
  downloadMbps: number;
  defaultPriceCents: number;
};
export function sameRoamingProfile(
  a: ProfileSnapshot,
  b: ProfileSnapshot,
): boolean {
  return (
    a.durationValue === b.durationValue &&
    a.durationUnit === b.durationUnit &&
    a.uploadMbps === b.uploadMbps &&
    a.downloadMbps === b.downloadMbps &&
    a.defaultPriceCents === b.defaultPriceCents
  );
}
