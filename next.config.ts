import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Minimal, self-contained server bundle (.next/standalone/server.js) for the
  // Docker image used to self-host on the Hostinger VPS. Ignored by Vercel,
  // which uses its own build pipeline — safe to keep enabled everywhere.
  output: "standalone",
  serverExternalPackages: ["ssh2"],
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    const headers = [
      // Keep the baseline CSP directives narrow so existing external assets
      // keep working; the app's portal preview remains embeddable same-origin.
      { key: "Content-Security-Policy", value: "base-uri 'self'; object-src 'none'; frame-ancestors 'self'" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
    ];
    if (process.env.NODE_ENV === "production") {
      headers.push({ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" });
    }
    return [{ source: "/:path*", headers }];
  },
  experimental: {
    serverActions: {
      // L'import d'un portail captif personnalisé (dossier HTML/CSS/JS +
      // images encodées base64) transite par une Server Action — la
      // limite par défaut de 1 Mo est trop courte pour un portail avec
      // images. Doit rester ≥ PORTAL_MAX_TOTAL_BYTES (captive-templates/
      // actions.ts) + la marge d'encodage base64 (~33 %).
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
