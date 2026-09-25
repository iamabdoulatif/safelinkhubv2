import { SignJWT, jwtVerify } from "jose";
import { can, type Capability } from "./roles";
import { cookies, headers } from "next/headers";

const COOKIE_NAME = "safelinkhub_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7;

const MFA_PENDING_COOKIE_NAME = "safelinkhub_mfa_pending";
const MFA_PENDING_DURATION_SECONDS = 5 * 60;
/** Audience des jetons « mot de passe OK, second facteur attendu ». */
export const MFA_AUDIENCE = "mfa";

function getSecretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export type SessionPayload = {
  userId: string;
  orgId: string;
  email: string;
  name: string;
  role: string;
};

// Nom du cookie + options + constructeur de jeton exposés pour les Route
// Handlers (ex. activation par formulaire HTML) qui doivent poser le cookie
// directement sur leur NextResponse plutôt que via cookies() de next/headers.
export const SESSION_COOKIE_NAME = COOKIE_NAME;
export const SESSION_COOKIE_MAX_AGE = SESSION_DURATION_SECONDS;
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  };
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSecretKey());
}

export async function createSession(payload: SessionPayload) {
  const token = await createSessionToken(payload);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, sessionCookieOptions());
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  // Navigateur : cookie. Application mobile : même jeton, en en-tête
  // « Authorization: Bearer » (voir app/api/mobile/v1). Un seul contrôle, donc
  // les mêmes droits partout.
  const token = cookieStore.get(COOKIE_NAME)?.value ?? (await bearerToken());
  if (!token) return null;
  return verifySessionToken(token);
}

async function bearerToken(): Promise<string | null> {
  const auth = (await headers()).get("authorization");
  const match = auth?.match(/^Bearer\s+(\S+)$/i);
  return match ? match[1] : null;
}

/**
 * Vérifie un jeton de SESSION. Refuse le jeton « MFA en attente » : signé avec
 * la même clé et porteur des mêmes champs, il valait jusqu'ici une session
 * complète si on le recopiait dans le cookie — le second facteur était alors
 * contournable. Il porte désormais `aud: "mfa"` (et `callback` pour ceux déjà
 * émis), et ne passe plus ici.
 */
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (payload.aud === MFA_AUDIENCE || "callback" in payload) return null;
    return {
      userId: String(payload.userId),
      orgId: String(payload.orgId),
      email: String(payload.email),
      name: String(payload.name),
      role: String(payload.role),
    };
  } catch {
    return null;
  }
}

/** "superadmin" is a strict superset of "admin" — same access everywhere
 * "admin" is required, plus the billing bypasses in lib/billing. */
export function isAdminRole(role: string | undefined): boolean {
  return role === "admin" || role === "superadmin";
}

export function isSuperAdmin(role: string | undefined): boolean {
  return role === "superadmin";
}

export async function requireAdminSession(): Promise<SessionPayload | null> {
  const session = await getSession();
  if (!session || !isAdminRole(session.role)) return null;
  return session;
}

/**
 * Session dont le rôle porte la capacité demandée.
 *
 * `requireAdminSession` garde son sens — administrateur complet — pour que
 * l'arrivée des rôles Éditeur/Lecteur/Agent n'ouvre RIEN par accident : une
 * écriture qu'on n'a pas explicitement rouverte reste réservée à l'admin.
 */
export async function requireCapability(
  capability: Capability,
): Promise<SessionPayload | null> {
  const session = await getSession();
  if (!session || !can(session.role, capability)) return null;
  return session;
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export type MfaPendingPayload = SessionPayload & { callback: string };

/**
 * Issued once the password check passes for an MFA-enrolled account, in
 * place of the real session — proves "knows the password" without granting
 * access until a valid TOTP/backup code follows. Five-minute lifetime, its
 * own cookie so it can never be mistaken for (or silently upgraded into) a
 * real session.
 */
export async function signMfaPendingToken(payload: MfaPendingPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(MFA_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${MFA_PENDING_DURATION_SECONDS}s`)
    .sign(getSecretKey());
}

/** Lit un jeton « MFA en attente » (cookie web ou corps de requête mobile). */
export async function verifyMfaPendingToken(token: string): Promise<MfaPendingPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), { audience: MFA_AUDIENCE });
    return payload as unknown as MfaPendingPayload;
  } catch {
    return null;
  }
}

export async function createMfaPendingToken(payload: MfaPendingPayload) {
  const token = await signMfaPendingToken(payload);

  const cookieStore = await cookies();
  cookieStore.set(MFA_PENDING_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MFA_PENDING_DURATION_SECONDS,
  });
}

export async function getMfaPendingToken(): Promise<MfaPendingPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(MFA_PENDING_COOKIE_NAME)?.value;
  return token ? verifyMfaPendingToken(token) : null;
}

export async function clearMfaPendingToken() {
  const cookieStore = await cookies();
  cookieStore.delete(MFA_PENDING_COOKIE_NAME);
}

export { COOKIE_NAME };
