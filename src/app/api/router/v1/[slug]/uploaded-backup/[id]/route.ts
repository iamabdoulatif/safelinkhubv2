import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations, routerUploadedBackups } from "@/lib/db/schema";
import { hashToken } from "@/lib/mikrotik/install-token";

/**
 * Sert le binaire d'une sauvegarde RouterOS UPLOADÉE au routeur cible pendant
 * une restauration : le routeur fait `/tool fetch url=… Authorization: Bearer
 * <token>` puis `/system backup load`. Jeton éphémère haché (même schéma que
 * l'install-token du VPN) — pas de blob public, la fenêtre se referme après la
 * restauration (le jeton est effacé côté restore).
 *
 * NOTE : réponse en flux d'octets (application/octet-stream). Le fichier fait
 * quelques Mo — bien en deçà de la coupure Cloudflare ~100 s.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params;

  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return new Response("Missing bearer token", { status: 401 });

  const db = getDb();
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  if (!org) return new Response("Unknown organization", { status: 404 });

  const [backup] = await db
    .select()
    .from(routerUploadedBackups)
    .where(
      and(
        eq(routerUploadedBackups.id, id),
        eq(routerUploadedBackups.orgId, org.id),
        eq(routerUploadedBackups.fetchTokenHash, hashToken(token)),
      ),
    )
    .limit(1);

  if (!backup) return new Response("Invalid or already-used fetch token", { status: 403 });
  if (!backup.fetchTokenExpiresAt || backup.fetchTokenExpiresAt < new Date()) {
    return new Response("Fetch token has expired", { status: 403 });
  }

  const bytes = Buffer.from(backup.data, "base64");
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(bytes.length),
      "Content-Disposition": `attachment; filename="slh-restore.backup"`,
      "Cache-Control": "no-store",
    },
  });
}
