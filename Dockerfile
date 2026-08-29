# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy workspace root files
COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./

# Copy all workspace packages
COPY packages/ ./packages/

# Install dependencies
RUN npm ci --ignore-scripts

# Build all packages
RUN npm run build

# ---

# Production stage
FROM node:22-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

# Copy workspace root
COPY package.json package-lock.json* ./

# Copy built packages (only dist + package.json for each)
COPY --from=builder /app/packages/shared-protocol/dist ./packages/shared-protocol/dist
COPY --from=builder /app/packages/shared-protocol/package.json ./packages/shared-protocol/

COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/core/package.json ./packages/core/

COPY --from=builder /app/packages/adapters/tiktok/dist ./packages/adapters/tiktok/dist
COPY --from=builder /app/packages/adapters/tiktok/package.json ./packages/adapters/tiktok/

COPY --from=builder /app/packages/adapters/mock/dist ./packages/adapters/mock/dist
COPY --from=builder /app/packages/adapters/mock/package.json ./packages/adapters/mock/

COPY --from=builder /app/packages/adapters/minecraft-rcon/dist ./packages/adapters/minecraft-rcon/dist
COPY --from=builder /app/packages/adapters/minecraft-rcon/package.json ./packages/adapters/minecraft-rcon/

COPY --from=builder /app/packages/app/dist ./packages/app/dist
COPY --from=builder /app/packages/app/package.json ./packages/app/
COPY --from=builder /app/packages/app/config ./packages/app/config

# Install production dependencies only
RUN npm ci --omit=dev --ignore-scripts

# SQLite database lives in a volume
VOLUME ["/app/data"]

EXPOSE 8080

CMD ["node", "packages/app/dist/main.js"]
