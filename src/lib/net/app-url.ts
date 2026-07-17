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
/** Origine locale/dev, injoignable depuis un routeur (localhost, 0.0.0.0,
 * 127.x, ::1) — cas réel : NEXT_PUBLIC_APP_URL=http://0.0.0.0:3000 a produit
 * des entrées walled-garden "0.0.0.0:3000" sur un routeur de prod. */
function isLocalOrigin(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host === "localhost" || host === "0.0.0.0" || host === "::1" || host.startsWith("127.")
    );
  } catch {
    return true; // URL invalide = aussi inutilisable qu'une locale
  }
}

export function getAppUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) {
    const cleaned = explicit.replace(/\/+$/, "");
    // En production, une valeur explicite LOCALE est une mauvaise config au
    // même titre qu'une valeur absente : mêmes conséquences (URL routeur
    // silencieusement cassée), même remède → on échoue fort.
    if (process.env.NODE_ENV === "production" && isLocalOrigin(cleaned)) {
      throw new Error(
        `NEXT_PUBLIC_APP_URL is set to a local origin (${cleaned}) that routers ` +
          "cannot reach. Set it to the public origin (e.g. https://safelinkhub.io) " +
          "in the runtime environment.",
      );
    }
    return cleaned;
  }

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
