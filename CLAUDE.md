ZabbixPilot
MASTER DEVELOPMENT PROMPT
Document complet pour Claude Code CLI — Développement de bout en bout

!	Ce document EST le prompt à donner à Claude Code. Copier-coller son contenu dans Claude Code CLI ou le référencer comme CLAUDE.md à la racine du projet. Chaque section est une instruction directe pour l'agent de développement.
 
0. Instructions pour Claude Code

Tu es l'agent de développement principal du projet ZabbixPilot. Ce document contient toutes les spécifications nécessaires pour développer le projet de bout en bout sans poser de questions. Tu dois :

1.	Lire ce document en intégralité avant d'écrire une seule ligne de code
2.	Respecter scrupuleusement la structure de projet définie en section 2
3.	Développer dans l'ordre des phases défini en section 4
4.	Valider chaque phase avec les tests définis avant de passer à la suivante
5.	Ne jamais sauter une étape même si elle semble simple
6.	Créer les tests unitaires et d'intégration en parallèle du code, pas après
7.	Documenter chaque service et chaque route API avec des commentaires JSDoc
8.	Signaler explicitement si une dépendance externe est indisponible plutôt que de l'ignorer

!	CONTRAINTE ABSOLUE : Ne jamais stocker de credentials en clair. Toujours chiffrer les tokens Zabbix, passwords, et secrets. Voir section 6 pour les détails de sécurité.

 
1. Contexte et Description du Produit

1.1 Qu'est-ce que ZabbixPilot
ZabbixPilot est une plateforme de pilotage qui se positionne au-dessus de Zabbix via son API JSON-RPC. Elle industrialise l'exploitation de Zabbix pour les grandes entreprises. Elle ne remplace pas Zabbix — elle le rend exploitable par toute une organisation.

1.2 Les quatre couches fonctionnelles
•	COUCHE 1 — Provisioning Industriel : onboarding de hosts de zéro jusqu'au monitoring complet, détection OS, génération de scripts adaptés, Template Builder pour créer des templates Zabbix sur mesure
•	COUCHE 2 — Alerting Intelligent : corrélation d'alertes, groupement, scoring de pertinence, fine-tuning des triggers, gestion des maintenances
•	COUCHE 3 — Espace de Travail NOC : file de travail priorisée, contexte par incident, intégration ITSM, temps réel, multi-instances Zabbix
•	COUCHE 4 — Vue Service Management : service mapping, vue DSI, rapports SLA automatiques avec synthèse LLM

1.3 Principes non négociables
•	L'IA (LLM) n'est utilisée QUE pour : analyse d'erreurs de commande en cas d'échec, génération de texte de synthèse SLA. JAMAIS pour la génération de configuration Zabbix
•	Toute modification de configuration passe par l'audit log : qui, quand, avant, après, pourquoi
•	Le Template Builder est 100% déterministe : ce que l'ingénieur saisit est exactement ce qui est généré
•	L'humain reste dans la boucle du provisioning : le produit réduit le temps d'intervention, il ne l'élimine pas
•	Multi-tenant : chaque entreprise cliente est un tenant isolé

 
2. Structure Complète du Projet

!	Créer cette structure EXACTEMENT. Ne pas renommer les dossiers ni modifier l'organisation. Le routing, les imports, et les tests en dépendent.

zabbixpilot/
  CLAUDE.md                          # Ce fichier — instructions permanentes
  package.json                       # Workspaces monorepo
  turbo.json                         # Turborepo config
  .env.example                       # Variables d'environnement documentées
  .env                               # Variables locales — jamais committé
  docker-compose.yml                 # Dev local : postgres, redis, nginx
  docker-compose.prod.yml            # Production on-premise

  apps/
    api/                             # Backend Fastify + TypeScript
      package.json
      tsconfig.json
      src/
        index.ts                     # Point d'entrée, server setup
        app.ts                       # Fastify instance, plugins, routes
        config/
          env.ts                     # Zod validation des variables d'env
          constants.ts               # Constantes : versions Zabbix, OS types, etc
        modules/
          auth/
            auth.routes.ts
            auth.service.ts
            auth.schema.ts
            auth.test.ts
          tenants/
            tenants.routes.ts
            tenants.service.ts
            tenants.schema.ts
            tenants.test.ts
          zabbix-instances/
            zabbix-instances.routes.ts
            zabbix-instances.service.ts
            zabbix-instances.schema.ts
            zabbix-instances.test.ts
          provisioning/
            provisioning.routes.ts
            provisioning.service.ts
            provisioning.schema.ts
            provisioning.jobs.ts     # BullMQ workers
            provisioning.test.ts
            os-detection/
              os-detector.ts         # Logique détection OS via agent
              script-generator.ts    # Génération scripts par OS
              scripts/               # Templates de scripts
                linux-rhel.sh.tmpl
                linux-ubuntu.sh.tmpl
                linux-debian.sh.tmpl
                linux-suse.sh.tmpl
                windows.ps1.tmpl
                aix.sh.tmpl
          template-builder/
            template-builder.routes.ts
            template-builder.service.ts
            template-builder.schema.ts
            template-builder.validator.ts  # Validateur exhaustif
            template-builder.generator.ts  # Génère JSON Zabbix
            template-builder.test.ts
            command-tester.ts              # Test commandes system.run
            error-analyzer.ts              # Analyse erreurs agent
          lifecycle/
            lifecycle.routes.ts
            lifecycle.service.ts
            lifecycle.test.ts
          alerting/
            alerting.routes.ts
            alerting.service.ts
            correlation-engine.ts          # Moteur de corrélation
            scoring-engine.ts              # Score de pertinence
            alerting.test.ts
          maintenance/
            maintenance.routes.ts
            maintenance.service.ts
            maintenance.test.ts
          noc/
            noc.routes.ts
            noc.service.ts
            noc.gateway.ts                 # Socket.io gateway
            noc.test.ts
          service-mgmt/
            service-mgmt.routes.ts
            service-mgmt.service.ts
            service-mgmt.test.ts
          sla/
            sla.routes.ts
            sla.service.ts
            sla.report-generator.ts        # PDF + LLM synthesis
            sla.test.ts
          audit/
            audit.routes.ts
            audit.service.ts
            audit.middleware.ts            # Middleware capture auto
            audit.test.ts
          users/
            users.routes.ts
            users.service.ts
            users.schema.ts
            users.test.ts
        integrations/
          zabbix/
            ZabbixApiService.ts            # Service central
            ZabbixApiService.test.ts
            zabbix-types.ts                # Types complets API Zabbix
            version-adapters/              # Un adapter par version
              v60.adapter.ts               # Zabbix 6.0
              v64.adapter.ts               # Zabbix 6.4
              v70.adapter.ts               # Zabbix 7.0
          ansible/
            AnsibleService.ts
            ansible-types.ts
          itsm/
            ITSMService.ts                 # Interface abstraite
            servicenow.adapter.ts
            jira.adapter.ts
          notifications/
            NotificationService.ts
            email.adapter.ts               # Nodemailer
            slack.adapter.ts
            teams.adapter.ts
          llm/
            LLMService.ts                  # Anthropic API
        shared/
          database/
            prisma.ts                      # Client Prisma singleton
          cache/
            redis.ts                       # Client Redis + helpers
          queue/
            bullmq.ts                      # Setup queues BullMQ
          crypto/
            encryption.ts                  # AES-256 encrypt/decrypt
          errors/
            AppError.ts                    # Classes d'erreurs métier
            error-codes.ts                 # Tous les codes d'erreur
          middlewares/
            auth.middleware.ts
            tenant.middleware.ts
            rbac.middleware.ts
      prisma/
        schema.prisma
        migrations/
        seed.ts                            # Données de test
      tests/
        integration/                       # Tests d'intégration API
        fixtures/                          # Données de test

    web/                                   # Frontend React + TypeScript
      package.json
      vite.config.ts
      tailwind.config.ts
      src/
        main.tsx
        App.tsx                            # Router principal
        pages/
          auth/
            LoginPage.tsx
          dashboard/
            DashboardPage.tsx              # Page d'accueil contextuelle
          provisioning/
            HostListPage.tsx
            NewHostPage.tsx
            HostDetailPage.tsx
            ProvisioningWizard.tsx         # Wizard multi-étapes
          template-builder/
            TemplateListPage.tsx
            TemplateBuilderPage.tsx        # Wizard 7 étapes
            TemplateDetailPage.tsx
          noc/
            NocPage.tsx                    # Espace travail NOC
          services/
            ServicesPage.tsx               # Vue service management
            ServiceDetailPage.tsx
          reports/
            ReportsPage.tsx
            SlaReportPage.tsx
          audit/
            AuditPage.tsx
          settings/
            SettingsPage.tsx
            ZabbixInstancesPage.tsx
            UsersPage.tsx
        components/
          layout/
            AppShell.tsx                   # Layout principal
            Sidebar.tsx
            TopBar.tsx
          ui/                              # Composants atomiques
            StatusBadge.tsx                # OK/WARNING/PROBLEM/UNKNOWN
            SeverityIcon.tsx
            HostCard.tsx
            AlertCard.tsx
            ServiceHealthCard.tsx
            ProgressStepper.tsx            # Pour wizards
            CodeEditor.tsx                 # Pour Template Builder
            CommandTester.tsx              # Test system.run live
          charts/
            MetricChart.tsx
            AvailabilityChart.tsx
            AlertHeatmap.tsx
        stores/
          auth.store.ts
          noc.store.ts                     # State NOC temps réel
          provisioning.store.ts
        hooks/
          useZabbixInstances.ts
          useAlerts.ts
          useSocket.ts                     # Socket.io hook
        lib/
          api.ts                           # Axios instance + interceptors
          queryClient.ts                   # React Query config
          utils.ts
        types/                             # Types frontend locaux

  packages/
    shared-types/                          # Types partagés front/back
      src/
        hosts.ts
        templates.ts
        alerts.ts
        services.ts
        audit.ts
        zabbix.ts
    zabbix-schema/                         # Schémas Zabbix par version
      src/
        v60/
        v64/
        v70/
    ui/                                    # Design tokens partagés

  infra/
    docker/
      api.Dockerfile
      web.Dockerfile
    k8s/
      namespace.yaml
      api-deployment.yaml
      web-deployment.yaml
      postgres-statefulset.yaml
      redis-deployment.yaml
    nginx/
      nginx.conf

 
3. Schéma Base de Données Complet

!	Ce schéma Prisma est la source de vérité. Ne pas modifier les noms de colonnes ni les relations sans mettre à jour tous les services qui les utilisent.

// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum PlanType { STARTER PROFESSIONAL ENTERPRISE ON_PREMISE }
enum OsType { LINUX_RHEL LINUX_UBUNTU LINUX_DEBIAN LINUX_SUSE WINDOWS AIX OTHER }
enum HostStatus { ONBOARDING ACTIVE MAINTENANCE DECOMMISSIONED }
enum JobStatus {
  PENDING DETECTING SCRIPT_GENERATED AGENT_DEPLOYED
  HOST_DECLARED OS_TEMPLATE_APPLIED OS_VALIDATED
  WAITING_APP_DECLARATION APPS_CONFIGURING SUCCESS FAILED
}
enum UserRole { ADMIN MONITORING_ENGINEER NOC_OPERATOR MANAGER READONLY }
enum RuleType { TOPOLOGICAL TEMPORAL TAG_BASED CUSTOM }

model Tenant {
  id              String    @id @default(cuid())
  name            String
  slug            String    @unique
  plan            PlanType  @default(STARTER)
  isActive        Boolean   @default(true)
  maxHosts        Int       @default(500)
  maxInstances    Int       @default(2)
  zabbixInstances ZabbixInstance[]
  users           User[]
  hosts           ManagedHost[]
  templates       ManagedTemplate[]
  correlationRules CorrelationRule[]
  services        BusinessService[]
  slaReports      SlaReport[]
  auditLogs       AuditLog[]
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  @@index([slug])
}

model User {
  id           String    @id @default(cuid())
  tenantId     String
  email        String
  passwordHash String
  firstName    String
  lastName     String
  role         UserRole  @default(NOC_OPERATOR)
  isActive     Boolean   @default(true)
  lastLoginAt  DateTime?
  tenant       Tenant    @relation(fields: [tenantId], references: [id])
  auditLogs    AuditLog[]
  createdAt    DateTime  @default(now())
  @@unique([tenantId, email])
}

model ZabbixInstance {
  id              String    @id @default(cuid())
  tenantId        String
  label           String
  apiUrl          String
  apiTokenEncrypted String
  version         String?
  isActive        Boolean   @default(true)
  lastHealthCheck DateTime?
  healthStatus    String?
  tenant          Tenant    @relation(fields: [tenantId], references: [id])
  hosts           ManagedHost[]
  templates       ManagedTemplate[]
  services        BusinessService[]
  createdAt       DateTime  @default(now())
  @@index([tenantId])
}

model ManagedHost {
  id               String      @id @default(cuid())
  tenantId         String
  zabbixInstanceId String
  zabbixHostId     String?
  hostname         String
  ipAddress        String
  os               OsType?
  osVersion        String?
  agentVersion     String?
  agentPort        Int         @default(10050)
  declaredRole     String?
  status           HostStatus  @default(ONBOARDING)
  location         String?
  tags             Json        @default("[]")
  hostGroupIds     Json        @default("[]")
  provisioningJob  ProvisioningJob?
  assignedTemplates HostTemplate[]
  tenant           Tenant      @relation(fields: [tenantId], references: [id])
  instance         ZabbixInstance @relation(fields: [zabbixInstanceId], references: [id])
  auditLogs        AuditLog[]
  createdAt        DateTime    @default(now())
  updatedAt        DateTime    @updatedAt
  @@index([tenantId, status])
  @@index([tenantId, zabbixInstanceId])
}

model ProvisioningJob {
  id              String      @id @default(cuid())
  hostId          String      @unique
  status          JobStatus   @default(PENDING)
  currentStep     String      @default("Initialisation")
  detectedOs      Json?
  generatedScript String?     @db.Text
  steps           Json        @default("[]")
  errorCode       String?
  errorMessage    String?
  startedAt       DateTime?
  completedAt     DateTime?
  host            ManagedHost @relation(fields: [hostId], references: [id])
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt
}

model ManagedTemplate {
  id               String      @id @default(cuid())
  tenantId         String
  zabbixInstanceId String
  zabbixTemplateId String?
  name             String
  internalName     String
  targetApp        String
  targetOs         OsType
  description      String?
  version          Int         @default(1)
  prerequisites    Json        @default("[]")
  macros           Json        @default("[]")
  items            Json        @default("[]")
  triggers         Json        @default("[]")
  scripts          Json        @default("[]")
  valueMaps        Json        @default("[]")
  discoveryRules   Json        @default("[]")
  validationRules  Json        @default("[]")
  isShared         Boolean     @default(false)
  isSystem         Boolean     @default(false)
  createdBy        String
  deployedAt       DateTime?
  tenant           Tenant      @relation(fields: [tenantId], references: [id])
  instance         ZabbixInstance @relation(fields: [zabbixInstanceId], references: [id])
  hostTemplates    HostTemplate[]
  createdAt        DateTime    @default(now())
  updatedAt        DateTime    @updatedAt
  @@unique([tenantId, zabbixInstanceId, internalName])
}

model HostTemplate {
  id          String          @id @default(cuid())
  hostId      String
  templateId  String
  appliedAt   DateTime        @default(now())
  host        ManagedHost     @relation(fields: [hostId], references: [id])
  template    ManagedTemplate @relation(fields: [templateId], references: [id])
  @@unique([hostId, templateId])
}

model CorrelationRule {
  id          String   @id @default(cuid())
  tenantId    String
  name        String
  type        RuleType @default(TEMPORAL)
  conditions  Json
  timeWindow  Int      @default(120)
  priority    Int      @default(0)
  isActive    Boolean  @default(true)
  tenant      Tenant   @relation(fields: [tenantId], references: [id])
  createdAt   DateTime @default(now())
}

model BusinessService {
  id               String    @id @default(cuid())
  tenantId         String
  zabbixInstanceId String
  zabbixServiceId  String?
  name             String
  description      String?
  slaTarget        Float     @default(99.9)
  weightedHealth   Boolean   @default(false)
  components       ServiceComponent[]
  slaReports       SlaReport[]
  tenant           Tenant    @relation(fields: [tenantId], references: [id])
  instance         ZabbixInstance @relation(fields: [zabbixInstanceId], references: [id])
  createdAt        DateTime  @default(now())
}

model ServiceComponent {
  id              String          @id @default(cuid())
  serviceId       String
  zabbixHostId    String
  zabbixItemIds   Json            @default("[]")
  weight          Float           @default(1.0)
  label           String?
  service         BusinessService @relation(fields: [serviceId], references: [id])
}

model SlaReport {
  id           String          @id @default(cuid())
  tenantId     String
  serviceId    String
  periodFrom   DateTime
  periodTo     DateTime
  availability Float
  slaTarget    Float
  isCompliant  Boolean
  incidents    Json            @default("[]")
  summary      String?         @db.Text
  pdfPath      String?
  generatedAt  DateTime        @default(now())
  tenant       Tenant          @relation(fields: [tenantId], references: [id])
  service      BusinessService @relation(fields: [serviceId], references: [id])
}

model AuditLog {
  id          String   @id @default(cuid())
  tenantId    String
  userId      String
  action      String
  entityType  String
  entityId    String
  before      Json?
  after       Json?
  comment     String?
  ipAddress   String
  userAgent   String?
  timestamp   DateTime @default(now())
  tenant      Tenant   @relation(fields: [tenantId], references: [id])
  user        User     @relation(fields: [userId], references: [id])
  @@index([tenantId, timestamp])
  @@index([tenantId, entityType, entityId])
}

 
4. Phases de Développement

!	Développer STRICTEMENT dans cet ordre. Ne pas commencer une phase si la précédente n'est pas complète et testée. Chaque phase se termine par une validation fonctionnelle.

PHASE 0	Setup et Infrastructure	Jour 1

•	Initialiser le monorepo avec Turborepo et les workspaces npm
•	Configurer TypeScript strict mode dans tous les packages
•	Créer docker-compose.yml avec PostgreSQL 16, Redis 7, Nginx
•	Configurer Prisma et appliquer le schéma complet de la section 3
•	Créer le fichier .env.example avec TOUTES les variables documentées
•	Setup Vitest pour les tests unitaires, Supertest pour les tests d'intégration
•	Configurer ESLint + Prettier avec règles strictes
•	Créer le CLAUDE.md à la racine avec les conventions de code

Variables d'environnement requises (.env.example) :
DATABASE_URL=postgresql://user:pass@localhost:5432/zabbixpilot
REDIS_URL=redis://localhost:6379
JWT_SECRET=<256-bit random>
JWT_REFRESH_SECRET=<256-bit random different>
ENCRYPTION_KEY=<256-bit random for AES-256>
ANTHROPIC_API_KEY=<optionnel - LLM pour synthese SLA>
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
NODE_ENV=development
PORT=3000
CORS_ORIGIN=http://localhost:5173

Validation Phase 0 : docker-compose up lance tous les services. prisma migrate dev applique le schéma sans erreur. Un test ping sur /api/health retourne 200.

PHASE 1	Auth + Tenants + Zabbix Instances	Jours 2-4

•	Module auth : POST /api/auth/login, POST /api/auth/refresh, POST /api/auth/logout
•	JWT RS256 avec expiration 15min, refresh token 30j avec rotation et blacklist Redis
•	Module tenants : CRUD complet avec validation du plan et des limites
•	Module users : CRUD, assignation de rôles, hash bcrypt factor 12
•	Module zabbix-instances : CRUD, chiffrement AES-256 du token API, test de connectivité
•	ZabbixApiService : méthodes healthCheck() et getApiVersion(), detection version
•	Middleware auth + tenant + RBAC sur toutes les routes protégées
•	Audit log automatique sur toutes les mutations

Validation Phase 1 : Login retourne un JWT valide. Création d'une instance Zabbix chiffre le token. Test de connectivité vers un Zabbix de test retourne la version. Les routes protégées rejettent les requêtes sans token.

PHASE 2	Provisioning — Couche 1 complète	Jours 5-12

2a — Détection OS
•	os-detector.ts : appels zabbix_get vers system.uname, system.sw.os, agent.version
•	Parsing et normalisation des résultats en OsType + version
•	Gestion des cas où l'agent n'est pas encore joignable : retour état AGENT_NOT_REACHABLE
•	Tests unitaires avec mock des réponses zabbix_get pour chaque OS

2b — Génération de scripts
•	script-generator.ts : sélection du template selon OsType détecté
•	Templates de scripts pour Linux RHEL/CentOS, Ubuntu/Debian, SUSE, Windows, AIX
•	Chaque template configure : installation agent, zabbix_agentd.conf (Server, ServerActive, Hostname), AllowKey=system.run[*], démarrage service, enable au boot
•	Les scripts incluent des commentaires explicatifs et une validation finale

2c — Job de provisioning BullMQ
•	Queue 'provisioning' avec 10 jobs max en parallèle
•	10 étapes séquentielles selon la séquence de la section 2.4
•	Chaque étape loggée dans ProvisioningJob.steps avec timestamp et résultat
•	Retry automatique x3 pour les étapes réseau avec backoff exponentiel
•	WebSocket broadcast du statut du job en temps réel vers le client

2d — Intégration Ansible
•	AnsibleService : détection de la disponibilité AWX via appel API
•	Si AWX disponible : génération et soumission du playbook via API AWX
•	Si AWX indisponible : génération du playbook YAML téléchargeable uniquement
•	Si pas d'Ansible du tout : script bash/powershell téléchargeable

2e — Template Builder
•	Wizard 7 étapes côté frontend avec validation à chaque étape avant progression
•	template-builder.validator.ts : TOUTES les règles de validation de la section 2.5
•	command-tester.ts : exécution de zabbix_get depuis l'API, retour résultat brut
•	error-analyzer.ts : patterns d'erreurs avec diagnostic et correction suggérée
•	template-builder.generator.ts : génération du JSON d'appels API Zabbix dans le bon ordre
•	Ordre obligatoire de création : template -> macros -> value maps -> items -> triggers -> graphs
•	Déploiement dans Zabbix via ZabbixApiService dans une transaction avec rollback si erreur

2f — Cycle de vie
•	Transitions de statut : ONBOARDING -> ACTIVE -> MAINTENANCE -> DECOMMISSIONED
•	Décommissionnement : workflow de validation, désactivation Zabbix, archivage config
•	Détection automatique des hosts fantômes : hosts DECOMMISSIONED avec alertes actives

Validation Phase 2 : Scénario de test complet : déclarer un host, détecter l'OS, générer le script, simuler l'installation, déclarer le host dans Zabbix de test, appliquer template OS, valider métriques. Créer une template via Template Builder, la déployer, vérifier dans Zabbix.

PHASE 3	Alerting Intelligent — Couche 2	Jours 13-18

•	correlation-engine.ts : corrélation topologique, temporelle, et par règles
•	Ingestion de la topologie réseau : formulaire de saisie manuelle ou import CSV
•	Fenêtre de tolérance temporelle configurable (défaut 120s) pour compenser les délais de polling
•	scoring-engine.ts : calcul du score basé sur historique des triggers
•	Cold start explicite : message UI clair pendant les 14 premiers jours
•	Suggestions de fine tuning : liste des triggers à fort taux de fausses alertes
•	Gestion des maintenances : intégration calendrier, création automatique périodes Zabbix
•	API routes alerting : alertes corrélées, acquittement, suppression temporaire
•	WebSocket : push des nouvelles alertes vers le NOC en temps réel

Validation Phase 3 : Simuler une tempête d'alertes avec 20 hosts dans le même segment réseau. Vérifier que la corrélation topologique les groupe en 1 incident racine. Créer une maintenance, vérifier la création de la période dans Zabbix.

PHASE 4	Espace de Travail NOC — Couche 3	Jours 19-24

•	noc.gateway.ts : Socket.io gateway, rooms par tenant, broadcast des alertes
•	File de travail priorisée : algorithme de scoring basé sur impact service, SLA, heure
•	Moteur de règles de priorisation : configurable par l'équipe NOC
•	Intégration ITSM : webhook sortant vers ServiceNow/JIRA, retour état ticket
•	Vue multi-instances : agrégation des alertes de toutes les instances Zabbix du tenant
•	Collaboration : statut 'en cours de traitement par X' visible en temps réel

Validation Phase 4 : Connexion de deux utilisateurs simultanés sur le NOC. Vérifier que les mises à jour d'alertes sont poussées en temps réel aux deux. Acquitter une alerte, vérifier la mise à jour chez l'autre utilisateur.

PHASE 5	Service Management + SLA — Couche 4	Jours 25-30

•	Service mapping : création via React Flow (drag-and-drop visuel de hosts vers services)
•	Intégration Zabbix Business Services (6.0+) : création et sync bidirectionnelle
•	Calcul de santé en temps réel : score pondéré selon composants et disponibilité
•	Vue management : interface dédiée avec uniquement les services, aucun objet technique
•	Générateur de rapports SLA : calcul disponibilité, exclusion maintenances, incidents
•	Génération PDF : utiliser puppeteer pour rendre le rapport HTML en PDF
•	Synthèse LLM : appel Anthropic API uniquement si ANTHROPIC_API_KEY configuré, sinon rapport sans synthèse
•	Envoi automatique par email en fin de période

Validation Phase 5 : Créer un service business avec 3 composants. Simuler une indisponibilité d'un composant. Vérifier le calcul de disponibilité. Générer un rapport SLA PDF et vérifier sa cohérence.

PHASE 6	Frontend complet + Design System	Jours 31-40

Design System — Règles absolues
•	Palette de couleurs : utiliser UNIQUEMENT les tokens définis dans packages/ui
•	Primary #D4500A, Dark #1A1A2E, Surface #16213E, Success #22C55E, Warning #F59E0B, Danger #EF4444
•	Typography : Inter pour l'UI, JetBrains Mono pour le code et les valeurs techniques
•	Composants shadcn/ui personnalisés avec les couleurs brand — ne pas utiliser les couleurs shadcn par défaut
•	Dark mode natif obligatoire sur toutes les pages
•	Animations : transitions CSS 150ms ease-out uniquement. Pas d'animations décoratives
•	Densité NOC : compact mode avec plus d'informations par pixel

Pages à développer
•	LoginPage : simple, épurée, logo ZabbixPilot centré, form email+password
•	DashboardPage : vue contextuelle selon le rôle — ingénieur voit les hosts, NOC voit les alertes, manager voit les services
•	ProvisioningWizard : stepper visuel en 10 étapes avec état en temps réel via WebSocket
•	TemplateBuilderPage : wizard 7 étapes, éditeur de code pour scripts, CommandTester live
•	NocPage : deux colonnes — file de travail à gauche, détail incident à droite, alertes en temps réel
•	ServicesPage : grid de cartes services avec score de santé animé, drill-down vers composants
•	SlaReportPage : rapport interactif avec graphes de disponibilité, export PDF
•	AuditPage : tableau filtrable avec diff avant/après pour chaque modification

PHASE 7	Tests, Sécurité, Performance	Jours 41-45

Tests requis
•	Couverture de tests unitaires minimum 80% sur les modules métier (services, validators, engines)
•	Tests d'intégration pour chaque route API : happy path + cas d'erreur + cas limites
•	Tests du Template Builder validator : un test par règle de validation
•	Tests du moteur de corrélation : scénario tempête d'alertes, scénario topologique
•	Tests de sécurité : injection SQL via Prisma (impossible par design, vérifier), XSS sur inputs, CSRF
•	Test de charge : 100 connexions WebSocket simultanées sur le NOC

Sécurité — Checklist obligatoire
•	Vérifier que CHAQUE route API valide l'appartenance de la ressource au tenant (pas de cross-tenant)
•	Vérifier que les tokens Zabbix ne sont JAMAIS retournés en clair dans les réponses API
•	Vérifier que les macros de type secret ne sont JAMAIS retournées en clair
•	Rate limiting configuré sur toutes les routes publiques
•	Headers de sécurité Nginx : HSTS, X-Frame-Options, CSP, X-Content-Type-Options
•	Audit log présent sur TOUTES les mutations : créations, modifications, suppressions

 
5. Règles Critiques ZabbixApiService

!	Ces règles sont non négociables. Une erreur dans l'interaction avec l'API Zabbix peut corrompre la configuration de monitoring du client.

5.1 Ordre de création des objets Zabbix
L'API Zabbix est stricte sur les dépendances. Respecter cet ordre sans exception :
9.	Template (template.create)
10.	Value Maps (valuemap.create) — référencés par les items
11.	User Macros (usermacro.create) — référencées par items et triggers
12.	Items (item.create) — référencent les macros et value maps
13.	Triggers (trigger.create) — référencent les items
14.	Graphs (graph.create) — référencent les items
15.	Discovery Rules (discoveryrule.create)
16.	Item Prototypes (itemprototype.create) — sous les discovery rules
17.	Trigger Prototypes (triggerprototype.create) — référencent les item prototypes
18.	Host linkage (host.update avec templates) — en dernier

5.2 Règles de nommage
•	Le champ 'host' de la template (identifiant interne) : pas d'espaces, pas de caractères spéciaux, uniquement [a-zA-Z0-9_-.]
•	Les expressions de triggers DOIVENT référencer le champ 'host' et non le champ 'name' de la template
•	Exemple correct : last(/Custom_Oracle_19c/oracle.status[{$ORACLE_SID}])=0
•	Exemple INCORRECT : last(/Oracle 19c Custom/oracle.status[{$ORACLE_SID}])=0

5.3 Types value_type et trends
•	value_type 0 = float : trends autorisé
•	value_type 1 = character : trends DOIT être '0'
•	value_type 2 = log : trends DOIT être '0'
•	value_type 3 = unsigned int : trends autorisé
•	value_type 4 = text : trends DOIT être '0'
•	Violation = item en état 'not supported' dans Zabbix

5.4 Macros de type secret
•	type 0 = texte normal : valeur visible
•	type 1 = secret : valeur masquée dans Zabbix UI, jamais retournée par l'API après création
•	type 2 = Vault path : pour intégration HashiCorp Vault
•	Tous les passwords et tokens dans les macros DOIVENT être de type 1

5.5 Cache des appels API Zabbix
•	Mettre en cache Redis avec TTL 30 secondes : getHosts, getTemplates, getActiveAlerts
•	Invalider le cache immédiatement après toute mutation
•	Ne JAMAIS cacher : healthCheck, getApiVersion, getItemCurrentValue
•	L'API Zabbix peut être lente (500ms à 2s) — le cache est critique pour l'UX

5.6 Gestion des versions Zabbix
// Version détectée au premier healthCheck, stockée dans ZabbixInstance.version
// Adapter le bon set de méthodes selon la version

// Business Services : disponible uniquement Zabbix 6.0+
// Si version < 6.0 : désactiver la Couche 4, afficher message explicatif

// Différences API notables :
// Zabbix 5.4 : pas de Business Services
// Zabbix 6.0 : introduction Business Services, nouveau format triggers
// Zabbix 6.4 : token auth (avant : user/password login)
// Zabbix 7.0 : changements dans les expressions de triggers

 
6. Sécurité — Implémentation Détaillée

6.1 Chiffrement AES-256
// shared/crypto/encryption.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex') // 32 bytes

export function encrypt(text: string): string {
  const iv = randomBytes(16)
  const cipher = createCipheriv(ALGORITHM, KEY, iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // Format : iv:tag:encrypted (hex)
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decrypt(encryptedText: string): string {
  const [ivHex, tagHex, dataHex] = encryptedText.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const data = Buffer.from(dataHex, 'hex')
  const decipher = createDecipheriv(ALGORITHM, KEY, iv)
  decipher.setAuthTag(tag)
  return decipher.update(data) + decipher.final('utf8')
}

6.2 Middleware RBAC
// Permissions par rôle
const PERMISSIONS = {
  ADMIN: ['*'],
  MONITORING_ENGINEER: [
    'hosts:*', 'templates:*', 'provisioning:*',
    'alerts:read', 'maintenance:*', 'audit:read'
  ],
  NOC_OPERATOR: [
    'hosts:read', 'alerts:*', 'noc:*',
    'maintenance:read', 'services:read'
  ],
  MANAGER: [
    'services:*', 'reports:*', 'audit:read', 'alerts:read'
  ],
  READONLY: ['hosts:read', 'alerts:read', 'services:read']
}

6.3 Validation tenantId sur chaque requête
// Tout accès à une ressource doit vérifier tenantId
// Exemple dans un service :

async getHost(hostId: string, tenantId: string): Promise<ManagedHost> {
  const host = await prisma.managedHost.findFirst({
    where: {
      id: hostId,
      tenantId: tenantId  // TOUJOURS filtrer par tenantId
    }
  })
  if (!host) throw new AppError('HOST_NOT_FOUND', 404)
  return host
}

 
7. Conventions de Code

7.1 Nommage
•	Fichiers : kebab-case (provisioning.service.ts)
•	Classes : PascalCase (ZabbixApiService)
•	Fonctions et variables : camelCase
•	Constantes : UPPER_SNAKE_CASE
•	Types et interfaces TypeScript : PascalCase, préfixe I pour les interfaces (ICreateHostParams)
•	Endpoints API : kebab-case (/api/zabbix-instances)

7.2 Structure d'un service
// Chaque service suit ce pattern
export class ProvisioningService {
  constructor(
    private readonly zabbixApi: ZabbixApiService,
    private readonly db: PrismaClient,
    private readonly cache: RedisCache,
    private readonly queue: Queue,
    private readonly audit: AuditService
  ) {}

  // 1. Méthodes publiques (appelées par les routes)
  // 2. Méthodes privées (logique interne)
  // 3. Toujours logger les erreurs avant de les throw
  // 4. Toujours appeler audit.log() sur les mutations
}

7.3 Gestion des erreurs
// shared/errors/AppError.ts
export class AppError extends Error {
  constructor(
    public readonly code: string,   // 'AGENT_002', 'TPL_001'
    public readonly statusCode: number,
    public readonly message: string,
    public readonly details?: unknown
  ) { super(message) }
}

// Toujours utiliser des codes d'erreur métier, jamais de strings libres
// Tous les codes sont documentés dans error-codes.ts

7.4 Documentation JSDoc
/**
 * Teste une commande system.run sur un host Zabbix
 * @param hostIp - Adresse IP du host cible
 * @param command - Commande à tester (sans le préfixe system.run[])
 * @param agentPort - Port de l'agent Zabbix (défaut 10050)
 * @returns Résultat du test avec valeur ou erreur analysée
 * @throws AppError AGENT_001 si l'agent est injoignable
 */
async testCommand(hostIp: string, command: string, agentPort = 10050): Promise<CommandTestResult>

 
8. Guide d'Utilisation Claude Code

8.1 Comment démarrer
Voici les commandes exactes à donner à Claude Code pour démarrer le développement dans le bon ordre :

Commande 1 — Setup initial (donner au premier agent)
Implémente la Phase 0 du projet ZabbixPilot selon le CLAUDE.md.
Crée toute la structure de dossiers définie en section 2.
Initialise le monorepo Turborepo avec npm workspaces.
Configure TypeScript strict, ESLint, Prettier.
Crée le docker-compose.yml avec PostgreSQL 16 et Redis 7.
Crée le schéma Prisma complet de la section 3.
Crée le .env.example avec toutes les variables documentées.
A la fin, lance les tests de validation de Phase 0.

Commande 2 — Auth et fondations (après Phase 0 validée)
Implémente la Phase 1 : modules auth, tenants, users, zabbix-instances.
Inclus les tests unitaires et d'intégration pour chaque module.
Respecte les conventions de code de la section 7.
Valide avec les critères de la Phase 1 définis en section 4.

Commande 3 — Provisioning (après Phase 1 validée)
Implémente la Phase 2 complète : détection OS, génération scripts,
job BullMQ, intégration Ansible, Template Builder avec validateur
exhaustif, command tester, error analyzer, cycle de vie hosts.
Le Template Builder doit implémenter TOUTES les règles de validation
de la section 2.5 et respecter l'ordre de création Zabbix de la section 5.1.

Commandes 4, 5, 6, 7 — Suites
Répéter le pattern pour chaque phase : 'Implémente la Phase X selon le CLAUDE.md, respecte les conventions, valide avec les critères définis.'

8.2 Agents parallèles
Claude Code peut faire travailler plusieurs agents en parallèle. Voici comment organiser le travail :

•	Agent 1 (principal) : développe le backend — phases 0 à 5
•	Agent 2 (frontend) : développe le frontend — peut commencer dès que les types partagés de Phase 0 sont créés
•	Agent 3 (tests) : crée les tests d'intégration en parallèle du développement
•	Agent 4 (infra) : configure Nginx, Docker, CI/CD en parallèle

!	Les agents parallèles ne doivent pas modifier le schéma Prisma simultanément. Toute modification de schema.prisma doit être séquentielle et validée par l'agent principal.

8.3 Checkpoints de validation
A la fin de chaque phase, Claude Code doit exécuter les validations suivantes avant de continuer :
19.	Tous les tests unitaires passent : npx vitest run
20.	Tous les tests d'intégration passent : npx vitest run tests/integration
21.	TypeScript ne produit aucune erreur : npx tsc --noEmit
22.	ESLint ne produit aucune erreur : npx eslint src
23.	Le scénario fonctionnel de la phase est démontrable manuellement

8.4 En cas de blocage
Si Claude Code rencontre une ambiguïté ou une impossibilité technique, il doit :
24.	Documenter le blocage dans un fichier BLOCKERS.md à la racine
25.	Proposer deux alternatives avec leurs avantages et inconvénients
26.	Continuer avec les autres tâches non bloquées
27.	Ne JAMAIS ignorer silencieusement un requirement ou le simplifier sans le signaler

 
9. Design Frontend — Spécifications Complètes

!	Le design doit sembler avoir été fait par un designer humain expérimenté. Éviter tout ce qui ressemble à du 'AI default style' : grids trop parfaits, couleurs trop propres, manque de personnalité.

9.1 Tokens de design
// packages/ui/src/tokens.ts
export const tokens = {
  colors: {
    primary: '#D4500A',
    primaryHover: '#B8420A',
    primaryLight: '#FFF0E8',
    bgDark: '#1A1A2E',
    bgSurface: '#16213E',
    bgCard: '#0F3460',
    bgLight: '#F5F5FA',
    textPrimary: '#1A1A2E',
    textMuted: '#4A4A6A',
    success: '#22C55E',
    successLight: '#F0FDF4',
    warning: '#F59E0B',
    warningLight: '#FFFBEB',
    danger: '#EF4444',
    dangerLight: '#FEF2F2',
    info: '#3B82F6',
    border: '#E2E8F0',
    borderDark: '#2D3748',
  },
  fonts: {
    ui: 'Inter, system-ui, sans-serif',
    mono: 'JetBrains Mono, Fira Code, monospace',
  },
  shadows: {
    card: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
    cardHover: '0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.05)',
  }
}

9.2 Composant StatusBadge
// Badges de statut Zabbix — couleurs sémantiques strictes
const STATUS_CONFIG = {
  OK:       { bg: 'bg-green-50',  text: 'text-green-700',  dot: 'bg-green-500'  },
  PROBLEM:  { bg: 'bg-red-50',    text: 'text-red-700',    dot: 'bg-red-500'    },
  UNKNOWN:  { bg: 'bg-gray-50',   text: 'text-gray-600',   dot: 'bg-gray-400'   },
  WARNING:  { bg: 'bg-amber-50',  text: 'text-amber-700',  dot: 'bg-amber-500'  },
  DISASTER: { bg: 'bg-red-100',   text: 'text-red-800',    dot: 'bg-red-600',   pulse: true },
}

9.3 Layout NOC
Le layout NOC est le plus critique. Il doit permettre à un opérateur de comprendre la situation en moins de 3 secondes après avoir ouvert la page.
•	Colonne gauche (35%) : file de travail — liste d'incidents priorisés, compacte, scrollable
•	Colonne droite (65%) : détail de l'incident sélectionné — contexte, historique, actions
•	Barre supérieure : compteurs en temps réel (DISASTER X, HIGH X, MEDIUM X), filtre rapide
•	Indicateur de connexion temps réel visible en permanence
•	Mode sombre obligatoire pour le NOC — les opérateurs travaillent dans des salles sombres

9.4 Animations autorisées
•	Pulse rouge sur les alertes DISASTER uniquement
•	Transition 150ms ease-out sur les hover de cartes
•	Fade-in 200ms sur l'apparition de nouveaux incidents
•	Progress bar animée pour les jobs de provisioning en cours
•	INTERDIT : skeleton loaders excessifs, spinners partout, transitions longues


