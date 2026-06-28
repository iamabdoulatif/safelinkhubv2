import { headers } from "next/headers";

/** Vercel sets x-forwarded-for; "unknown" only happens off-platform (local dev without a proxy). */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const forwardedFor = h.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return h.get("x-real-ip") ?? "unknown";
}
