import { and, eq, gte, lt, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { loginAttempts } from "@/lib/db/schema";

// Two independent windows: a tight one per email (stops someone hammering
// one account) and a looser one per IP across all emails (stops credential
// stuffing — many emails, same source). Either one tripping blocks the
// attempt.
const EMAIL_WINDOW_MINUTES = 15;
const EMAIL_MAX_ATTEMPTS = 5;
const IP_WINDOW_MINUTES = 15;
const IP_MAX_ATTEMPTS = 20;
const PRUNE_AFTER_HOURS = 24;

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export async function checkLoginRateLimit(email: string, ipAddress: string): Promise<RateLimitResult> {
  const db = getDb();
  const emailWindowStart = new Date(Date.now() - EMAIL_WINDOW_MINUTES * 60_000);
  const ipWindowStart = new Date(Date.now() - IP_WINDOW_MINUTES * 60_000);

  const [emailFailures, ipFailures] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(loginAttempts)
      .where(
        and(
          eq(loginAttempts.email, email),
          eq(loginAttempts.success, false),
          gte(loginAttempts.createdAt, emailWindowStart),
        ),
      ),
    db
      .select({ count: sql<number>`count(*)` })
      .from(loginAttempts)
      .where(
        and(
          eq(loginAttempts.ipAddress, ipAddress),
          eq(loginAttempts.success, false),
          gte(loginAttempts.createdAt, ipWindowStart),
        ),
      ),
  ]);

  const emailCount = Number(emailFailures[0]?.count ?? 0);
  const ipCount = Number(ipFailures[0]?.count ?? 0);

  if (emailCount >= EMAIL_MAX_ATTEMPTS) {
    return { allowed: false, retryAfterSeconds: EMAIL_WINDOW_MINUTES * 60 };
  }
  if (ipCount >= IP_MAX_ATTEMPTS) {
    return { allowed: false, retryAfterSeconds: IP_WINDOW_MINUTES * 60 };
  }
  return { allowed: true };
}

export async function recordLoginAttempt(email: string, ipAddress: string, success: boolean) {
  const db = getDb();
  await db.insert(loginAttempts).values({ email, ipAddress, success });

  // Opportunistic cleanup instead of a cron job — cheap given the indexes,
  // and keeps the table from growing unbounded on a low-traffic login form.
  const pruneBefore = new Date(Date.now() - PRUNE_AFTER_HOURS * 60 * 60_000);
  await db.delete(loginAttempts).where(lt(loginAttempts.createdAt, pruneBefore));
}
