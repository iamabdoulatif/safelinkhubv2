import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routers } from "@/lib/db/schema";
import type { RouterOSClient } from "./client";
import { decryptSecret } from "./crypto";
import { getOrCreateMikhmonAdminPassword } from "./mikhmon-admin-password";
import { writeMikhmonSession } from "./mikhmon-session";

type RouterRow = typeof routers.$inferSelect;

/**
 * Repose la session MikHmon « SafeLinkHub » dans le conteneur du routeur et
 * horodate routers.mikhmonSessionAt. Partagé par le bouton « Reconfigurer la
 * session » et par la mise à jour automatique d'image (un conteneur recréé
 * repart du config.php de l'image, sans session).
 */
export async function repostMikhmonSession(
  client: RouterOSClient,
  router: RouterRow,
): Promise<{ ok: true; hotspot: string; dns: string } | { ok: false; error: string }> {
  if (!router.username || !router.passwordEncrypted) {
    return { ok: false, error: "Détails de connexion du routeur manquants." };
  }
  const conts = await client.talk(["/container/print", "=detail"]).catch(() => [] as Record<string, string>[]);
  const mk = conts.find(
    (c) => /mikhmon/i.test(String(c.name ?? "")) || /mikhmon/i.test(String(c["root-dir"] ?? "")),
  );
  if (!mk?.[".id"]) return { ok: false, error: "Aucun conteneur MikHmon sur ce routeur." };
  const rootDir = String(mk["root-dir"] ?? "").replace(/^\//, "");

  const profs = await client.talk(["/ip/hotspot/profile/print", "=detail"]).catch(() => [] as Record<string, string>[]);
  const prof = profs.find((p) => p.name && p.name !== "default") ?? {};
  const hotspot = String(prof.name ?? router.name);
  const dns = String(prof["hotspot-address"] ?? "");

  const wrote = await writeMikhmonSession(
    client,
    rootDir,
    "SafeLinkHub",
    {
      ip: "11.11.11.1",
      user: router.username,
      pass: decryptSecret(router.passwordEncrypted),
      hotspot,
      dns,
      adminPassword: await getOrCreateMikhmonAdminPassword(router.id),
      currency: "fcfa",
      autoload: 10,
      iface: 1,
      infolp: "",
      idle: "disable",
      livereport: "enable",
    },
    mk[".id"],
  );
  if (!wrote.ok) return { ok: false, error: `Écriture impossible : ${wrote.error}` };
  await getDb().update(routers).set({ mikhmonSessionAt: new Date() }).where(eq(routers.id, router.id));
  return { ok: true, hotspot, dns };
}
