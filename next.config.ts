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
