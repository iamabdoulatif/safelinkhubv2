import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations, routers } from "@/lib/db/schema";
import { hashToken } from "@/lib/mikrotik/install-token";

/**
 * Appelée par la ligne d'installation « sans conflit » (vpn-install.ts) quand
 * le routeur porte déjà safelinkhub-wg0 : le routeur EN ATTENTE créé pour
 * cette ligne est supprimé, rien n'est installé. N'efface jamais un routeur
 * déjà installé (statut pending exigé).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return new Response("Missing bearer token", { status: 401 });
  const db = getDb();
  const [org] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, slug)).limit(1);
  if (!org) return new Response("Unknown organization", { status: 404 });
  const deleted = await db
    .delete(routers)
    .where(and(eq(routers.orgId, org.id), eq(routers.installTokenHash, hashToken(token)), eq(routers.status, "pending")))
    .returning({ id: routers.id });
  return new Response(deleted.length ? "cancelled" : "nothing to cancel", { status: 200 });
}
