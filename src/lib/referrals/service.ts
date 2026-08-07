// Module "plain" (pas de "use server") : logique métier du parrainage,
// importable par les server actions, les server components et les gardes
// (activation de compte, fin d'auto-setup, approbation d'accès distant).

import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations, referralRewards, users } from "@/lib/db/schema";
import { appendSafecoinCredit } from "@/lib/safecoin/ledger";
import {
  REFERRAL_EVENT_LABEL,
  normalizeReferralCode,
  referralRewardScCents,
  type ReferralEvent,
} from "./rewards";

export type { ReferralEvent };

/**
 * Alphabet volontairement sans I/O/0/1 : le code se lit à voix haute et se
 * recopie à la main (WhatsApp, papier) sans confusion.
 */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  let out = "";
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return out;
}

/**
 * Renvoie le code de parrainage de l'org, en le frappant à la première demande.
 * Frappé PARESSEUSEMENT plutôt qu'à la création de l'org : les orgs existantes
 * n'ont pas de code, et personne n'a besoin d'un code tant qu'il n'ouvre pas sa
 * carte de parrainage. La colonne est UNIQUE — en cas de collision (très
 * improbable), on retente.
 */
export async function ensureReferralCode(orgId: string): Promise<string> {
  const db = getDb();
  const [existing] = await db
    .select({ code: organizations.referralCode })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (existing?.code) return existing.code;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    try {
      const [row] = await db
        .update(organizations)
        .set({ referralCode: code })
        // Ne pose le code que s'il n'y en a pas déjà un : deux requêtes
        // simultanées ne peuvent pas s'écraser mutuellement.
        .where(and(eq(organizations.id, orgId), sql`${organizations.referralCode} is null`))
        .returning({ code: organizations.referralCode });
      if (row?.code) return row.code;
      // Pas de ligne mise à jour = un code a été posé entre-temps : on le lit.
      const [now] = await db
        .select({ code: organizations.referralCode })
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1);
      if (now?.code) return now.code;
    } catch {
      // Collision sur l'index unique — on retire un autre code.
    }
  }
  throw new Error("Impossible de générer un code de parrainage.");
}

/** Retrouve l'org propriétaire d'un code, ou null si le code est inconnu. */
export async function findOrgByReferralCode(
  rawCode: string,
): Promise<{ id: string; name: string } | null> {
  const code = normalizeReferralCode(rawCode);
  if (!code) return null;
  const db = getDb();
  const [row] = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.referralCode, code))
    .limit(1);
  return row ?? null;
}

/**
 * Rattache un filleul à son parrain, à l'inscription. Ne crédite RIEN : la
 * prime d'inscription n'est versée qu'à l'activation du compte (voir
 * awardReferral), pour qu'une adresse jetable jamais confirmée ne rapporte pas.
 * Silencieux si le code est inconnu — un lien périmé ne doit pas faire échouer
 * une inscription.
 */
export async function attachReferrer(referredOrgId: string, rawCode: string): Promise<void> {
  const referrer = await findOrgByReferralCode(rawCode);
  if (!referrer) return;
  // Un parrainage de soi-même n'a pas de sens (et serait une machine à SC).
  if (referrer.id === referredOrgId) return;
  await getDb()
    .update(organizations)
    .set({ referredByOrgId: referrer.id })
    .where(eq(organizations.id, referredOrgId));
}

/**
 * Verse la prime due au parrain du filleul `referredOrgId` pour `event`.
 *
 * Idempotent à DEUX niveaux : l'unicité `(referred_org_id, event)` de
 * referral_rewards, et la clé d'idempotence du grand livre. Rejouer l'événement
 * (re-run d'auto-setup, webhook re-livré) ne crédite jamais deux fois.
 *
 * Best-effort par construction : appelée depuis des chemins critiques
 * (activation de compte, fin d'auto-setup, approbation de paiement), elle ne
 * doit JAMAIS les faire échouer. Toute erreur est avalée et signalée par la
 * valeur de retour.
 */
export async function awardReferral(
  referredOrgId: string,
  event: ReferralEvent,
): Promise<{ awarded: boolean; reason?: string }> {
  try {
    const db = getDb();
    const [referred] = await db
      .select({ referrerOrgId: organizations.referredByOrgId, name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, referredOrgId))
      .limit(1);
    if (!referred?.referrerOrgId) return { awarded: false, reason: "no_referrer" };

    const amountScCents = referralRewardScCents(event);

    // Réserve l'étape AVANT de créditer : si deux appels concurrents passent,
    // un seul insère, l'autre repart bredouille sans toucher au solde.
    const [reserved] = await db
      .insert(referralRewards)
      .values({
        referrerOrgId: referred.referrerOrgId,
        referredOrgId,
        event,
        amountScCents,
      })
      .onConflictDoNothing({
        target: [referralRewards.referredOrgId, referralRewards.event],
      })
      .returning({ id: referralRewards.id });
    if (!reserved) return { awarded: false, reason: "already_awarded" };

    const credit = await appendSafecoinCredit({
      orgId: referred.referrerOrgId,
      entryType: "referral_bonus",
      amountScCents,
      idempotencyKey: `referral:${event}:${referredOrgId}`,
      referenceType: "referral_reward",
      referenceId: reserved.id,
      note: `Parrainage — ${REFERRAL_EVENT_LABEL[event]} (${referred.name})`,
    });

    if ("entryId" in credit && credit.entryId) {
      await db
        .update(referralRewards)
        .set({ ledgerEntryId: credit.entryId })
        .where(eq(referralRewards.id, reserved.id));
    }
    return { awarded: true };
  } catch (err) {
    return { awarded: false, reason: err instanceof Error ? err.message : "error" };
  }
}

/**
 * Prime « accès distant 1 an ». Filtre la durée ici plutôt que chez les trois
 * appelants (webhook GeniusPay, validation admin, paiement depuis le solde),
 * pour qu'aucun d'eux ne puisse se tromper de règle : seul `yearly` rapporte.
 */
export async function awardVpnYearlyReferral(
  orgId: string,
  billingPeriod: string,
): Promise<{ awarded: boolean; reason?: string }> {
  if (billingPeriod !== "yearly") return { awarded: false, reason: "not_yearly" };
  return awardReferral(orgId, "vpn_yearly");
}

export type ReferralSummary = {
  code: string;
  totalScCents: number;
  referredCount: number;
  rewards: {
    id: string;
    event: ReferralEvent;
    amountScCents: number;
    referredName: string;
    createdAt: Date;
  }[];
  /** Filleuls rattachés, y compris ceux qui n'ont encore rien rapporté. */
  referred: { id: string; name: string; contact: string | null; joinedAt: Date }[];
};

/** Tout ce qu'affiche la carte « Parrainage » d'une org. */
export async function getReferralSummary(orgId: string): Promise<ReferralSummary> {
  const db = getDb();
  const code = await ensureReferralCode(orgId);

  const rewards = await db
    .select({
      id: referralRewards.id,
      event: referralRewards.event,
      amountScCents: referralRewards.amountScCents,
      createdAt: referralRewards.createdAt,
      referredName: organizations.name,
    })
    .from(referralRewards)
    .innerJoin(organizations, eq(organizations.id, referralRewards.referredOrgId))
    .where(eq(referralRewards.referrerOrgId, orgId))
    .orderBy(desc(referralRewards.createdAt))
    .limit(50);

  // Le filleul est une ORG ; on affiche l'email de son compte le plus ancien
  // (le fondateur) pour que le parrain reconnaisse qui il a invité.
  const referred = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      joinedAt: organizations.createdAt,
      contact: sql<string | null>`(
        select ${users.email} from ${users}
        where ${users.orgId} = ${organizations.id}
        order by ${users.createdAt} asc limit 1
      )`,
    })
    .from(organizations)
    .where(eq(organizations.referredByOrgId, orgId))
    .orderBy(desc(organizations.createdAt))
    .limit(100);

  return {
    code,
    totalScCents: rewards.reduce((sum, r) => sum + r.amountScCents, 0),
    referredCount: referred.length,
    rewards: rewards.map((r) => ({
      id: r.id,
      event: r.event as ReferralEvent,
      amountScCents: r.amountScCents,
      referredName: r.referredName,
      createdAt: r.createdAt,
    })),
    referred,
  };
}
