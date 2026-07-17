// TEMPORAIRE — libellés partagés de la porte d'autorisation générique
// (router_link / remote_access). Module "plain" (pas de "use server") :
// importable côté client (modal) comme côté serveur.
// TODO: Remplacer par système de paiement intégré.

export type FeatureAccessId = "router_link" | "remote_access";

export const FEATURE_ACCESS: {
  id: FeatureAccessId;
  label: string;
  /** Phrase affichée dans le modal de demande. */
  description: string;
}[] = [
  {
    id: "router_link",
    label: "Lier un MikroTik",
    description:
      "Ajouter un routeur MikroTik à votre espace (connexion directe). Un administrateur doit autoriser l'accès avant que vous puissiez lier un routeur.",
  },
  {
    id: "remote_access",
    label: "Tunnel d'accès distant",
    description:
      "Créer un tunnel sécurisé (WireGuard ou OpenVPN) pour piloter votre MikroTik sans IP publique. Un administrateur doit autoriser l'accès avant la création du tunnel.",
  },
];

export function isFeatureAccess(value: string): value is FeatureAccessId {
  return FEATURE_ACCESS.some((f) => f.id === value);
}

export function featureAccessLabel(feature: string): string {
  return FEATURE_ACCESS.find((f) => f.id === feature)?.label ?? feature;
}

export function featureAccessDescription(feature: string): string {
  return FEATURE_ACCESS.find((f) => f.id === feature)?.description ?? "";
}
