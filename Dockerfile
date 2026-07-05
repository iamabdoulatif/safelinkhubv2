# Next.js 16 standalone image for self-hosting on the Hostinger VPS.
# Built in GitHub Actions and pushed to GHCR; the VPS only pulls + runs it.
# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS base
# ssh2 (serverExternalPackages) pulls an OPTIONAL native "cpu-features" addon;
# these build tools let npm compile it instead of noisily failing. The final
# runner stage below ships none of them.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# --- deps: install node_modules from the lockfile -------------------------
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- builder: produce .next/standalone -----------------------------------
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Public DB-backed pages (e.g. /blog) are statically rendered at build, exactly
# like on Vercel, so the build needs DATABASE_URL. Passed as BuildKit secrets
# (mounted only for this step, never persisted in an image layer). The Server
# Actions encryption key is pinned at build so action IDs stay stable across
# rebuilds — same value must be provided at runtime (see deploy/.env).
RUN --mount=type=secret,id=dburl --mount=type=secret,id=sakey \
    DATABASE_URL="$(cat /run/secrets/dburl)" \
    NEXT_SERVER_ACTIONS_ENCRYPTION_KEY="$(cat /run/secrets/sakey)" \
    npm run build

# --- runner: minimal runtime --------------------------------------------
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs -m nextjs
# The standalone output already bundles a trimmed node_modules + server.js.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
