// Formulaire du panneau dual WAN — hors « use server » (constante exportée).
export type DualWanForm = {
  mode: "complet" | "complement";
  cas: "cas1" | "cas2" | "cas3" | "cas4";
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

/**
 * APPAIRAGES STARLINK de l'auto-setup — le parc pose du Standard V3 et du
 * Mini, dans les quatre combinaisons possibles. L'admin choisit ce qu'il a
 * branché, le reste (ratio des seaux PCC, commentaires des interfaces) est
 * déduit par le workflow n8n : 400 Mbit pour un Standard V3, 150 pour un Mini,
 * d'où 3:1, 1:1 ou 1:3 selon le couple. Miroir du tableau `CAS` du nœud
 * « Valider la demande » (docs/n8n/dualwan.md).
 */
export const STARLINK_PAIRS: {
  cas: DualWanForm["cas"];
  label: string;
  ratio: string;
  aide: string;
}[] = [
  {
    cas: "cas1",
    label: "Standard V3 + Mini",
    ratio: "3:1",
    aide: "Le Standard V3 porte trois connexions sur quatre.",
  },
  {
    cas: "cas2",
    label: "Standard V3 + Standard V3",
    ratio: "1:1",
    aide: "Deux liens équivalents, répartition à parts égales.",
  },
  {
    cas: "cas3",
    label: "Mini + Mini",
    ratio: "1:1",
    aide: "Deux Mini, répartition à parts égales.",
  },
  {
    cas: "cas4",
    label: "Mini + Standard V3",
    ratio: "1:3",
    aide: "Le Mini est branché en premier ; le Standard V3 prend trois connexions sur quatre.",
  },
];

export function starlinkPair(cas: string) {
  return STARLINK_PAIRS.find((p) => p.cas === cas) ?? null;
}
