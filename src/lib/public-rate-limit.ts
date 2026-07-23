import { and, eq, gte, lt, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { publicSubmissionAttempts } from "@/lib/db/schema";
import { getClientIp } from "@/lib/auth/client-ip";

export const PUBLIC_SUBMISSION_WINDOW_MINUTES = 60;
const PUBLIC_SUBMISSION_MAX_ATTEMPTS = 5;
const PUBLIC_SUBMISSION_PRUNE_AFTER_HOURS = 24;

export type PublicSubmissionBucket = "contact" | "testimonial" | "recover";

type PublicSubmissionRateLimitResult =
  | { allowed: true }
  | { allowed: false; error: string; retryAfterSeconds: number };

export async function checkPublicSubmissionRateLimit(
  bucket: PublicSubmissionBucket,
  ipAddress: string,
): Promise<PublicSubmissionRateLimitResult> {
  const db = getDb();
  const windowStart = new Date(Date.now() - PUBLIC_SUBMISSION_WINDOW_MINUTES * 60_000);
  const [attempts] = await db
    .select({ count: sql<number>`count(*)` })
    .from(publicSubmissionAttempts)
    .where(
      and(
        eq(publicSubmissionAttempts.bucket, bucket),
        eq(publicSubmissionAttempts.ipAddress, ipAddress),
        gte(publicSubmissionAttempts.createdAt, windowStart),
      ),
    );

  if (Number(attempts?.count ?? 0) >= PUBLIC_SUBMISSION_MAX_ATTEMPTS) {
    return {
      allowed: false,
      retryAfterSeconds: PUBLIC_SUBMISSION_WINDOW_MINUTES * 60,
      error: "Trop de soumissions récentes. Réessayez plus tard.",
    };
  }
  return { allowed: true };
}

async function recordPublicSubmissionAttempt(
  bucket: PublicSubmissionBucket,
  ipAddress: string,
): Promise<void> {
  const db = getDb();
  await db.insert(publicSubmissionAttempts).values({ bucket, ipAddress });

  const pruneBefore = new Date(Date.now() - PUBLIC_SUBMISSION_PRUNE_AFTER_HOURS * 60 * 60_000);
  await db.delete(publicSubmissionAttempts).where(lt(publicSubmissionAttempts.createdAt, pruneBefore));
}

export async function enforcePublicSubmissionRateLimit(
  bucket: PublicSubmissionBucket,
): Promise<PublicSubmissionRateLimitResult> {
  const ipAddress = await getClientIp();
  const limit = await checkPublicSubmissionRateLimit(bucket, ipAddress);
  if (!limit.allowed) return limit;
  await recordPublicSubmissionAttempt(bucket, ipAddress);
  return { allowed: true };
}
