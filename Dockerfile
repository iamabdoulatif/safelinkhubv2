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
# NEXT_PUBLIC_* vars are inlined into the bundle at BUILD time, so the public
# app origin must be present now — a runtime -e is too late for a standalone
# build. Router install commands (/tool fetch url=...) are built from this;
# an empty value makes getAppUrl() emit http://localhost:3000 (which the router
# can't reach → "resolving error") or throw in production. Defaults to the
# canonical prod domain; override with --build-arg for other environments.
ARG NEXT_PUBLIC_APP_URL=https://safelinkhub.io
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
# The build runs WITHOUT a database, on purpose.
#
# It used to receive DATABASE_URL so that DB-backed pages could be prerendered.
# That secret pointed at the old Neon instance and was never updated when
# production moved to a local Postgres — so every deploy baked pages from a
# database that is not the live one, and served them until ISR caught up.
# Pointing it at production is not possible either: slh-postgres listens on
# 127.0.0.1 only, which is the right posture and not one to weaken for a build.
#
# Every DB-backed public page carries `revalidate`, and every query guards on
# a missing DATABASE_URL, so the build prerenders them empty and the runtime
# fills them from the real database. Measured: 88 pages in 250 ms, no database.
# The deploy script warms those pages right after the swap so the first
# visitor never meets the empty version.
#
# The Server Actions encryption key IS still pinned at build, so action IDs
# stay stable across rebuilds — same value must be provided at runtime.
RUN --mount=type=secret,id=sakey \
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
