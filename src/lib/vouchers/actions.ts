"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { packages, vouchers, routers } from "@/lib/db/schema";
import { requireAdminSession } from "@/lib/auth/session";
import { connectToRouter } from "@/lib/mikrotik/router-sync";
import {
  packageProfileName,
  SUPPORTED_PROFILE_DURATIONS,
} from "@/lib/mikrotik/package-voucher-profile";

const CODE_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

function randomCode(length = 6) {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

/**
 * Génère des vouchers RÉELS : chaque code est créé comme utilisateur hotspot
 * sur le MikroTik choisi (via le tunnel WireGuard), avec le profil dont la
 * durée correspond au forfait. On n'enregistre en base QUE les codes
 * réellement créés sur le routeur — donc plus de "faux-semblants" : un voucher
 * présent sur safelinkhub.io existe forcément sur le routeur.
 */
export async function generateVouchers(_prevState: unknown, formData: FormData) {
  const session = await requireAdminSession();
  if (!session) return { error: "Non authentifié." };

  const packageId = String(formData.get("packageId") ?? "");
  const routerId = String(formData.get("routerId") ?? "");
  const quantity = Number(formData.get("quantity") ?? 0);
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!packageId) return { error: "Sélectionnez un forfait." };
  if (!routerId) return { error: "Sélectionnez un routeur." };
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 200) {
    return { error: "La quantité doit être un entier entre 1 et 200." };
  }

  const db = getDb();
  const [pkg] = await db
    .select({
      id: packages.id,
      name: packages.name,
      active: packages.active,
      durationValue: packages.durationValue,
      durationUnit: packages.durationUnit,
    })
    .from(packages)
    .where(and(eq(packages.id, packageId), eq(packages.orgId, session.orgId)))
    .limit(1);

  if (!pkg) return { error: "Forfait introuvable." };
  if (!pkg.active) return { error: "Ce forfait est désactivé." };

  const profileName = packageProfileName(pkg.durationValue, pkg.durationUnit);
  if (!profileName) {
    return {
      error: `La durée du forfait « ${pkg.name} » ne correspond à aucun profil hotspot du routeur. Durées supportées : ${SUPPORTED_PROFILE_DURATIONS}.`,
    };
  }

  const [router] = await db
    .select()
    .from(routers)
    .where(and(eq(routers.id, routerId), eq(routers.orgId, session.orgId)))
    .limit(1);
  if (!router) return { error: "Routeur introuvable." };

  // Génère des codes uniques dans le lot, puis écarte ceux déjà présents en
  // base (username est unique globalement) pour ne pas faire échouer l'insert.
  const batch = new Set<string>();
  while (batch.size < quantity) batch.add(randomCode());
  let codeList = [...batch];
  const clash = await db
    .select({ username: vouchers.username })
    .from(vouchers)
    .where(inArray(vouchers.username, codeList));
  const taken = new Set(clash.map((r) => r.username));
  codeList = codeList.map((c) => {
    let candidate = c;
    while (taken.has(candidate)) candidate = randomCode();
    taken.add(candidate);
    return candidate;
  });

  // Connexion au routeur via le tunnel. Hors ligne / injoignable → on n'insère
  // rien (pas de voucher qui n'existerait pas sur le routeur).
  let client;
  try {
    client = await connectToRouter(router);
  } catch (e) {
    return {
      error: `Routeur injoignable : ${
        e instanceof Error ? e.message : "connexion échouée"
      }. Vérifiez qu'il est en ligne.`,
    };
  }

  const created: string[] = [];
  let failure: string | null = null;
  try {
    for (const code of codeList) {
      try {
        const exists = await client
          .talk(["/ip/hotspot/user/print", `?name=${code}`])
          .catch(() => []);
        if (exists.length > 0) continue; // collision improbable côté routeur : on saute
        await client.talk([
          "/ip/hotspot/user/add",
          `=name=${code}`,
          `=password=${code}`,
          `=profile=${profileName}`,
        ]);
        created.push(code);
      } catch (e) {
        failure = e instanceof Error ? e.message : "échec de création sur le routeur";
        break;
      }
    }
  } finally {
    client.close();
  }

  // N'enregistre que les codes réellement créés sur le routeur.
  if (created.length > 0) {
    await db.insert(vouchers).values(
      created.map((code) => ({
        orgId: session.orgId,
        username: code,
        packageId: pkg.id,
        routerId: router.id,
        profileName,
        status: "PROVISIONED" as const,
        useCase: "Batch Create",
        note,
      })),
    );
    revalidatePath("/admin/vouchers");
  }

  if (failure) {
    return created.length > 0
      ? { error: `Créés : ${created.length}/${quantity}, puis échec routeur : ${failure}` }
      : { error: `Échec de création sur le routeur : ${failure}` };
  }
  return { success: true, created: created.length };
}
