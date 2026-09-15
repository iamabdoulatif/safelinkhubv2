// Formulaire du panneau dual WAN — hors « use server » (constante exportée).
export type DualWanForm = {
  mode: "complet" | "complement";
  cas: "cas1" | "cas2" | "cas3";
  lanInterface: string;
  wan1Interface: string;
  wan2Interface: string;
  wan1Mbps: number | "";
  wan2Mbps: number | "";
  detachWan2FromBridge: boolean;
  dryRun: boolean;
};

export const DUALWAN_DEFAULTS: DualWanForm = {
  mode: "complet",
  cas: "cas1",
  lanInterface: "",
  wan1Interface: "E1-WAN-FAI",
  wan2Interface: "E2-WAN-FAI",
  wan1Mbps: "",
  wan2Mbps: "",
  detachWan2FromBridge: false,
  dryRun: true,
};
