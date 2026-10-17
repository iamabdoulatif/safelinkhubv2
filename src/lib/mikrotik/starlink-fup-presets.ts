import type { FupLink } from "./starlink-fup";

/** Operator-confirmed dates on 17 October 2026. Never infer future renewals. */
export function suggestedStarlinkLinks(routerId: string): FupLink[] {
  const base = { quotaGB: 5000, reserveGB: 500, cycleConfirmed: true };
  if (routerId === "0c1fea72-50fb-4593-a740-ea2a3fe49c5f") return [
    { ...base, id: "fouanga-standard", name: "FOUANGA Standard", interface: "E1-WAN-FAI", cycleStart: "2026-09-21T00:00:00.000Z", cycleEnd: "2026-10-21T00:00:00.000Z" },
    { ...base, id: "fouanga-mini", name: "FOUANGA Mini", interface: "E2-WAN-FAI", cycleStart: "2026-10-10T00:00:00.000Z", cycleEnd: "2026-11-10T00:00:00.000Z" },
  ];
  if (routerId === "d06f824e-d9a6-4423-85e1-42e578aab23d") return [
    { ...base, id: "kongasso-starlink", name: "KONGASSO Starlink", interface: "E1-WAN-FAI", cycleStart: "2026-10-03T00:00:00.000Z", cycleEnd: "2026-11-03T00:00:00.000Z" },
  ];
  return [];
}
