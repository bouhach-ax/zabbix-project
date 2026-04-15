---
name: ZabbixPilot Phase 0 — État de l'infrastructure
description: Phase 0 complète et validée — monorepo Turborepo, Prisma, docker-compose, health endpoint
type: project
---

Phase 0 de ZabbixPilot est complète et validée.

**Why:** Initialisation complète du projet selon le CLAUDE.md — structure, outils, infrastructure.

**How to apply:** La Phase 1 peut démarrer immédiatement (Auth + Tenants + Zabbix Instances).

## Ce qui est en place

- Monorepo Turborepo + npm workspaces
- apps/api (Fastify + TypeScript strict)
- apps/web (React + Vite + Tailwind — stubs Phase 6)
- packages/shared-types, packages/zabbix-schema, packages/ui (tokens design)
- docker-compose.yml : PostgreSQL 16 + Redis 7 + Nginx — validé
- Prisma schema complet (section 3 du CLAUDE.md) — validé ✓
- .env.example avec toutes les variables documentées
- Vitest configuré — test health passe ✓
- ESLint + Prettier configurés
- Stubs pour tous les modules (Phase 1 à 5)

## Critères de validation Phase 0 — tous passés

- `tsc --noEmit` → 0 erreurs ✓
- `prisma validate` → schema valide ✓
- `docker compose config` → valide ✓
- `GET /api/health` → 200 `{"status":"ok"}` ✓
