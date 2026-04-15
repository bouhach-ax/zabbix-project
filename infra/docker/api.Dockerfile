# =============================================================================
# ZabbixPilot API — Multi-stage production Dockerfile
# =============================================================================

# --- Stage 1: Dependencies ---
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/zabbix-schema/package.json ./packages/zabbix-schema/
COPY packages/ui/package.json ./packages/ui/
RUN npm ci --ignore-scripts && npm rebuild bcryptjs

# --- Stage 2: Build ---
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json turbo.json tsconfig.base.json ./
COPY apps/api ./apps/api
COPY packages ./packages
RUN npx prisma generate --schema=apps/api/prisma/schema.prisma
RUN npx turbo build --filter=@zabbixpilot/api...

# --- Stage 3: Production ---
FROM node:20-alpine AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 zabbixpilot
COPY package.json package-lock.json turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/zabbix-schema/package.json ./packages/zabbix-schema/
COPY packages/ui/package.json ./packages/ui/
RUN npm ci --omit=dev --ignore-scripts && npm rebuild bcryptjs && npm cache clean --force
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/packages/shared-types/dist ./packages/shared-types/dist 2>/dev/null || true
COPY --from=builder /app/packages/ui/dist ./packages/ui/dist 2>/dev/null || true
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=30s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1
USER zabbixpilot
EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "apps/api/dist/index.js"]
