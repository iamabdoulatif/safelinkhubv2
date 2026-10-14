// Suggestions de configuration pour l'agent : tout ce que l'opérateur saisissait
// à la main dans l'auto-setup lui est PROPOSÉ (il clique au lieu d'écrire).
//   - portails captifs déjà créés dans son organisation ;
//   - forfaits existants + une série de presets (durée → prix suggéré) ;
//   - nom de Wi-Fi dérivé du nom de l'organisation ;
//   - adresse de hotspot par défaut.
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { captiveTemplates, organizations, packages } from "@/lib/db/schema";
import { resolveAgentLinkFromRequest } from "@/lib/agent-link/service";
import { ROUTER_SETUP_PROFILE } from "@/lib/mikrotik/router-setup-profile";

// Presets proposés par l'agent : l'opérateur en coche, ajuste le prix s'il veut.
// Prix indicatifs en FCFA, alignés sur les profils voucher historiques.
const FORFAIT_PRESETS = [
  { durationCode: "3h", label: "3 heures", priceFcfa: 100 },
  { durationCode: "5h", label: "5 heures", priceFcfa: 100 },
  { durationCode: "7h", label: "7 heures", priceFcfa: 100 },
  { durationCode: "1d", label: "1 jour", priceFcfa: 200 },
  { durationCode: "3d", label: "3 jours", priceFcfa: 500 },
  { durationCode: "4d", label: "4 jours", priceFcfa: 500 },
  { durationCode: "5d", label: "5 jours", priceFcfa: 700 },
  { durationCode: "7d", label: "1 semaine", priceFcfa: 1000 },
  { durationCode: "14d", label: "2 semaines", priceFcfa: 1500 },
  { durationCode: "30d", label: "1 mois", priceFcfa: 2000 },
];

function wifiSuggestion(orgName: string): string {
  const base = orgName.replace(/[^0-9A-Za-zÀ-ÿ ]/g, "").trim().toUpperCase() || "SAFELINKHUB";
  return `${base} WIFI`.slice(0, 32);
}

export async function GET(request: Request) {
  const link = await resolveAgentLinkFromRequest(request);
  if (!link.ok) {
    return Response.json({ error: link.reason === "expired" ? "Code expiré." : "Code de liaison invalide." }, { status: 401 });
  }
  const db = getDb();
  const [org] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, link.orgId)).limit(1);
  const portals = await db
    .select({ id: captiveTemplates.id, name: captiveTemplates.name })
    .from(captiveTemplates)
    .where(eq(captiveTemplates.orgId, link.orgId));
  const existing = await db
    .select({ id: packages.id, name: packages.name, priceFcfa: packages.priceCents, active: packages.active })
    .from(packages)
    .where(eq(packages.orgId, link.orgId));

  return Response.json({
    orgName: org?.name ?? link.orgName,
    wifiNameSuggestion: wifiSuggestion(org?.name ?? link.orgName),
    hotspotAddressDefault: ROUTER_SETUP_PROFILE.hotspotBridge.gateway,
    portals,
    existingPackages: existing.filter((p) => p.active),
    forfaitPresets: FORFAIT_PRESETS,
  });
}
