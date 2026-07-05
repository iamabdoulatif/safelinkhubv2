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
# NOTE: if any page/route hits the DB at build time (e.g. static blog params),
# pass the needed vars as build args in the CI workflow. The admin app is
# almost entirely dynamic, so a plain build should not need DATABASE_URL.
RUN npm run build

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
