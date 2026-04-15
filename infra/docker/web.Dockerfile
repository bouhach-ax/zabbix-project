# =============================================================================
# ZabbixPilot Web — Multi-stage production Dockerfile
# =============================================================================

# --- Stage 1: Dependencies ---
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json turbo.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/zabbix-schema/package.json ./packages/zabbix-schema/
COPY packages/ui/package.json ./packages/ui/
RUN npm ci

# --- Stage 2: Build ---
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json turbo.json tsconfig.base.json ./
COPY apps/web ./apps/web
COPY packages ./packages
RUN npx turbo build --filter=@zabbixpilot/web...

# --- Stage 3: Nginx ---
FROM nginx:1.27-alpine AS runner
RUN rm /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY infra/nginx/spa.conf /etc/nginx/conf.d/default.conf
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/run/nginx.pid
USER nginx
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/ || exit 1
CMD ["nginx", "-g", "daemon off;"]
