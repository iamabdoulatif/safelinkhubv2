import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { can, type Capability } from "@/lib/auth/roles";
import { requireMobileSession } from "@/lib/mobile/http";

const CAPABILITIES: Capability[] = ["members", "billing", "settings", "routers", "packages", "tickets"];

/** GET /api/mobile/v1/me — l'utilisateur, son organisation et ses droits. */
export async function GET() {
  const auth = await requireMobileSession();
  if ("response" in auth) return auth.response;
  const { session } = auth;

  const [org] = await getDb()
    .select({ id: organizations.id, name: organizations.name, slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.id, session.orgId))
    .limit(1);

  return Response.json({
    user: { id: session.userId, email: session.email, name: session.name, role: session.role },
    organization: org ?? null,
    // L'app masque les écrans que le rôle ne permet pas (le serveur refuse de toute façon).
    capabilities: CAPABILITIES.filter((c) => can(session.role, c)),
  });
}
