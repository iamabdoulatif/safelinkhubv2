/**
 * Resolve the public app URL used to build router-facing script/asset URLs.
 *
 * These URLs are baked into RouterOS commands (`/tool fetch url="..."`) and are
 * fetched *by the MikroTik router*, not by the browser or the server. That means
 * `localhost` is meaningless there — the router would try to reach itself and
 * fail DNS resolution (`resolving error`, downloaded 0KiB).
 *
 * Resolution order:
 *   1. NEXT_PUBLIC_APP_URL  — the canonical public origin (e.g. https://safelinkhub.io)
 *   2. VERCEL_URL           — auto-injected on Vercel deploys
 *   3. http://localhost:3000 — dev only
 *
 * In production we refuse to fall back to localhost: emitting a localhost URL
 * into a router command produces a silently broken install, so we fail loud
 * with an actionable message instead.
 */
export function getAppUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/+$/, "");

  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "NEXT_PUBLIC_APP_URL is not set. Router install commands would point at " +
        "localhost, which the router cannot reach. Set NEXT_PUBLIC_APP_URL to the " +
        "public origin (e.g. https://safelinkhub.io) in the runtime environment.",
    );
  }

  return "http://localhost:3000";
}
