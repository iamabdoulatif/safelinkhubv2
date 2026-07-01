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
      (c) => c.name === "mikhmon" || String(c["root-dir"] ?? "").includes("mikhmon"),
    );

    if (!mikhmon) {
      return Response.json({ error: "MikHmon container not found on router." }, { status: 404 });
    }

    const status = mikhmon.status;
    if (status === "running") {
      return Response.json({ ok: true, message: "Container already running.", status });
    }

    await client.talk(["/container/start", `=numbers=${mikhmon[".id"]}`]);
    return Response.json({ ok: true, message: "Container start command sent.", was: status });
  } catch (err) {
    return Response.json({
      error: `Container operation failed: ${err instanceof Error ? err.message : "unknown"}`,
    }, { status: 500 });
  } finally {
    client.close();
  }
}
