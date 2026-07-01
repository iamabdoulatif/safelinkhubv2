import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routers } from "@/lib/db/schema";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { connectToRouter } from "@/lib/mikrotik/router-sync";

/** Superadmin-only: start the MikHmon container on a router by name or id. */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || !isSuperAdmin(session.role)) {
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }

  const { routerId } = await request.json();
  if (!routerId) return Response.json({ error: "routerId required." }, { status: 400 });

  const db = getDb();
  const [router] = await db.select().from(routers).where(eq(routers.id, routerId)).limit(1);
  if (!router) return Response.json({ error: "Router not found." }, { status: 404 });

  let client;
  try {
    client = await connectToRouter(router, 20000, 2);
  } catch (err) {
    return Response.json({
      error: `Could not connect: ${err instanceof Error ? err.message : "unknown"}`,
    }, { status: 502 });
  }

  try {
    const containers = await client.talk(["/container/print"]);
    const mikhmon = containers.find(
      (c) =>
        c.name === "mikhmonv3-safelinkhub:latest" ||
        c.name === "mikhmon-sf-v1:latest" ||
        String(c.name ?? "").includes("mikhmon") ||
        String(c["root-dir"] ?? "").includes("mikhmon"),
    );

    if (!mikhmon) {
      return Response.json({
        error: "MikHmon container not found on router.",
        allContainers: containers.map((c) => ({ id: c[".id"], name: c.name, status: c.status, rootDir: c["root-dir"] })),
      }, { status: 404 });
    }

    // Return full container object to diagnose field names
    return Response.json({ ok: true, debug: true, container: mikhmon });
  } catch (err) {
    return Response.json({
      error: `Container operation failed: ${err instanceof Error ? err.message : "unknown"}`,
    }, { status: 500 });
  } finally {
    client.close();
  }
}
