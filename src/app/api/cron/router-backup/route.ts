import { NextRequest } from "next/server";
import { captureAllOnlineRouters, captureRouterBackup } from "@/lib/mikrotik/router-backup";

export const maxDuration = 800;

/**
 * Sauvegarde quotidienne de chaque routeur en ligne (timer systemd sur le VPS —
 * voir /etc/systemd/system/router-backup.timer ; l'entrée vercel.json ne sert
 * que si l'app est un jour déployée sur Vercel).
 *
 * Volontairement séparée du health-check : celui-ci sonde 12 routeurs en 300 s,
 * alors qu'un snapshot lit ~5 000 tickets par routeur. Les mêler ferait dépasser
 * le budget de temps du health-check et laisserait des routeurs non sondés —
 * donc marqués offline à tort.
 *
 * La capture est séquentielle (voir captureAllOnlineRouters) : les connexions
 * API passent toutes par le même relais, qu'une salve concurrente fait tomber.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  // ?routerId=… : sauvegarde un seul routeur. Sert à vérifier la capture sur un
  // appareil précis sans lancer une passe sur tout le parc.
  const routerId = request.nextUrl.searchParams.get("routerId");
  if (routerId) {
    const one = await captureRouterBackup(routerId, { trigger: "auto" });
    return Response.json(one, { status: "error" in one && one.error ? 400 : 200 });
  }

  const results = await captureAllOnlineRouters();

  return Response.json({
    captured: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
}
