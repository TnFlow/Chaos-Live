# =============================================================================
# Chaos-Live — Multi-Stage Production Dockerfile
# =============================================================================

# --- Stage 1: Build & Bundle ---
FROM node:22-alpine AS builder

WORKDIR /app

# Install build essentials for native deps if needed
RUN apk add --no-cache python3 make g++

# Copy package manifests
COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./

# Copy all workspace packages
COPY packages/ ./packages/

# Install all dependencies (including devDependencies for build)
RUN npm ci --ignore-scripts

# Generate Prisma client
RUN npx prisma generate --schema=packages/core/prisma/schema.prisma

# Build all TypeScript packages and Vite overlay assets
RUN npm run build

# --- Stage 2: Production Runner ---
FROM node:22-alpine AS production

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV WS_PORT=8080

# Install curl/wget for healthchecks
RUN apk add --no-cache wget

# Create data directory for SQLite with node ownership
RUN mkdir -p /app/data && chown -R node:node /app

# Copy root manifest
COPY --chown=node:node package.json package-lock.json* ./

# Copy built package artifacts
COPY --chown=node:node --from=builder /app/packages/shared-protocol/dist ./packages/shared-protocol/dist
COPY --chown=node:node --from=builder /app/packages/shared-protocol/package.json ./packages/shared-protocol/

COPY --chown=node:node --from=builder /app/packages/core/dist ./packages/core/dist
COPY --chown=node:node --from=builder /app/packages/core/package.json ./packages/core/
COPY --chown=node:node --from=builder /app/packages/core/prisma ./packages/core/prisma

COPY --chown=node:node --from=builder /app/packages/adapters/tiktok/dist ./packages/adapters/tiktok/dist
COPY --chown=node:node --from=builder /app/packages/adapters/tiktok/package.json ./packages/adapters/tiktok/

COPY --chown=node:node --from=builder /app/packages/adapters/twitch/dist ./packages/adapters/twitch/dist
COPY --chown=node:node --from=builder /app/packages/adapters/twitch/package.json ./packages/adapters/twitch/

COPY --chown=node:node --from=builder /app/packages/adapters/mock/dist ./packages/adapters/mock/dist
COPY --chown=node:node --from=builder /app/packages/adapters/mock/package.json ./packages/adapters/mock/

COPY --chown=node:node --from=builder /app/packages/adapters/minecraft-rcon/dist ./packages/adapters/minecraft-rcon/dist
COPY --chown=node:node --from=builder /app/packages/adapters/minecraft-rcon/package.json ./packages/adapters/minecraft-rcon/

COPY --chown=node:node --from=builder /app/packages/overlay/dist ./packages/overlay/dist
COPY --chown=node:node --from=builder /app/packages/overlay/package.json ./packages/overlay/

COPY --chown=node:node --from=builder /app/packages/app/dist ./packages/app/dist
COPY --chown=node:node --from=builder /app/packages/app/package.json ./packages/app/
COPY --chown=node:node --from=builder /app/packages/app/config ./packages/app/config

# Copy Prisma runtime artifacts
COPY --chown=node:node --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --chown=node:node --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Install production dependencies only
RUN npm ci --omit=dev --ignore-scripts

# Switch to non-root user
USER node

# SQLite database volume
VOLUME ["/app/data"]

EXPOSE 8080

# Native healthcheck querying the /health endpoint
HEALTHCHECK --interval=20s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

CMD ["node", "packages/app/dist/main.js"]
