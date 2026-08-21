export type MikhmonAccess = {
  kind: "cloud";
  url: string;
};

/** The cloud domain is reserved for boards which cannot run RouterOS Container. */
export function resolveMikhmonAccess(input: {
  supportsContainers: boolean | null;
  cloudDomain: string | null;
}): MikhmonAccess | null {
  if (input.supportsContainers !== false || !input.cloudDomain) return null;
  return { kind: "cloud", url: `https://${input.cloudDomain}` };
}

/** Cloud MikHmon lives on the relay, so it never needs RouterOS container/NAT repair. */
export function shouldRepairRouterMikhmon(service: string, hasCloudInstance: boolean): boolean {
  return service === "mikhmon" && !hasCloudInstance;
}
