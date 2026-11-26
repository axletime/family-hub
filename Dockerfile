# syntax=docker/dockerfile:1
# Family Hub — multi-stage build producing a small Next.js standalone image.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
# Build tools in case a prebuilt better-sqlite3 binary isn't available for this CPU.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund && npm rebuild better-sqlite3

FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/data

# Unraid convention: nobody:users (99:100) owns appdata.
RUN groupmod -o -g 100 users 2>/dev/null || true \
 && mkdir -p /data && chown 99:100 /data

COPY --from=builder --chown=99:100 /app/.next/standalone ./
COPY --from=builder --chown=99:100 /app/.next/static ./.next/static
COPY --from=builder --chown=99:100 /app/public ./public
COPY --from=builder --chown=99:100 /app/fh-server.cjs ./fh-server.cjs

USER 99:100
VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# fh-server.cjs stamps each request with the real socket address, then starts server.js.
CMD ["node", "fh-server.cjs"]
