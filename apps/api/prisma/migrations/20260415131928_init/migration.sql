-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('STARTER', 'PROFESSIONAL', 'ENTERPRISE', 'ON_PREMISE');

-- CreateEnum
CREATE TYPE "OsType" AS ENUM ('LINUX_RHEL', 'LINUX_UBUNTU', 'LINUX_DEBIAN', 'LINUX_SUSE', 'WINDOWS', 'AIX', 'OTHER');

-- CreateEnum
CREATE TYPE "HostStatus" AS ENUM ('ONBOARDING', 'ACTIVE', 'MAINTENANCE', 'DECOMMISSIONED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'DETECTING', 'SCRIPT_GENERATED', 'AGENT_DEPLOYED', 'HOST_DECLARED', 'OS_TEMPLATE_APPLIED', 'OS_VALIDATED', 'WAITING_APP_DECLARATION', 'APPS_CONFIGURING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MONITORING_ENGINEER', 'NOC_OPERATOR', 'MANAGER', 'READONLY');

-- CreateEnum
CREATE TYPE "RuleType" AS ENUM ('TOPOLOGICAL', 'TEMPORAL', 'TAG_BASED', 'CUSTOM');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" "PlanType" NOT NULL DEFAULT 'STARTER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "maxHosts" INTEGER NOT NULL DEFAULT 500,
    "maxInstances" INTEGER NOT NULL DEFAULT 2,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'NOC_OPERATOR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZabbixInstance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "apiUrl" TEXT NOT NULL,
    "apiTokenEncrypted" TEXT NOT NULL,
    "version" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastHealthCheck" TIMESTAMP(3),
    "healthStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ZabbixInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagedHost" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "zabbixInstanceId" TEXT NOT NULL,
    "zabbixHostId" TEXT,
    "hostname" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "os" "OsType",
    "osVersion" TEXT,
    "agentVersion" TEXT,
    "agentPort" INTEGER NOT NULL DEFAULT 10050,
    "declaredRole" TEXT,
    "status" "HostStatus" NOT NULL DEFAULT 'ONBOARDING',
    "location" TEXT,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "hostGroupIds" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManagedHost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProvisioningJob" (
    "id" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "currentStep" TEXT NOT NULL DEFAULT 'Initialisation',
    "detectedOs" JSONB,
    "generatedScript" TEXT,
    "steps" JSONB NOT NULL DEFAULT '[]',
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProvisioningJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagedTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "zabbixInstanceId" TEXT NOT NULL,
    "zabbixTemplateId" TEXT,
    "name" TEXT NOT NULL,
    "internalName" TEXT NOT NULL,
    "targetApp" TEXT NOT NULL,
    "targetOs" "OsType" NOT NULL,
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "prerequisites" JSONB NOT NULL DEFAULT '[]',
    "macros" JSONB NOT NULL DEFAULT '[]',
    "items" JSONB NOT NULL DEFAULT '[]',
    "triggers" JSONB NOT NULL DEFAULT '[]',
    "scripts" JSONB NOT NULL DEFAULT '[]',
    "valueMaps" JSONB NOT NULL DEFAULT '[]',
    "discoveryRules" JSONB NOT NULL DEFAULT '[]',
    "validationRules" JSONB NOT NULL DEFAULT '[]',
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "deployedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManagedTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HostTemplate" (
    "id" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HostTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorrelationRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "RuleType" NOT NULL DEFAULT 'TEMPORAL',
    "conditions" JSONB NOT NULL,
    "timeWindow" INTEGER NOT NULL DEFAULT 120,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CorrelationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessService" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "zabbixInstanceId" TEXT NOT NULL,
    "zabbixServiceId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "slaTarget" DOUBLE PRECISION NOT NULL DEFAULT 99.9,
    "weightedHealth" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceComponent" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "zabbixHostId" TEXT NOT NULL,
    "zabbixItemIds" JSONB NOT NULL DEFAULT '[]',
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "label" TEXT,

    CONSTRAINT "ServiceComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlaReport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "periodFrom" TIMESTAMP(3) NOT NULL,
    "periodTo" TIMESTAMP(3) NOT NULL,
    "availability" DOUBLE PRECISION NOT NULL,
    "slaTarget" DOUBLE PRECISION NOT NULL,
    "isCompliant" BOOLEAN NOT NULL,
    "incidents" JSONB NOT NULL DEFAULT '[]',
    "summary" TEXT,
    "pdfPath" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlaReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "comment" TEXT,
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "Tenant_slug_idx" ON "Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", "email");

-- CreateIndex
CREATE INDEX "ZabbixInstance_tenantId_idx" ON "ZabbixInstance"("tenantId");

-- CreateIndex
CREATE INDEX "ManagedHost_tenantId_status_idx" ON "ManagedHost"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ManagedHost_tenantId_zabbixInstanceId_idx" ON "ManagedHost"("tenantId", "zabbixInstanceId");

-- CreateIndex
CREATE UNIQUE INDEX "ProvisioningJob_hostId_key" ON "ProvisioningJob"("hostId");

-- CreateIndex
CREATE UNIQUE INDEX "ManagedTemplate_tenantId_zabbixInstanceId_internalName_key" ON "ManagedTemplate"("tenantId", "zabbixInstanceId", "internalName");

-- CreateIndex
CREATE UNIQUE INDEX "HostTemplate_hostId_templateId_key" ON "HostTemplate"("hostId", "templateId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_timestamp_idx" ON "AuditLog"("tenantId", "timestamp");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_entityType_entityId_idx" ON "AuditLog"("tenantId", "entityType", "entityId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZabbixInstance" ADD CONSTRAINT "ZabbixInstance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagedHost" ADD CONSTRAINT "ManagedHost_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagedHost" ADD CONSTRAINT "ManagedHost_zabbixInstanceId_fkey" FOREIGN KEY ("zabbixInstanceId") REFERENCES "ZabbixInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProvisioningJob" ADD CONSTRAINT "ProvisioningJob_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "ManagedHost"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagedTemplate" ADD CONSTRAINT "ManagedTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagedTemplate" ADD CONSTRAINT "ManagedTemplate_zabbixInstanceId_fkey" FOREIGN KEY ("zabbixInstanceId") REFERENCES "ZabbixInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostTemplate" ADD CONSTRAINT "HostTemplate_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "ManagedHost"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostTemplate" ADD CONSTRAINT "HostTemplate_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ManagedTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrelationRule" ADD CONSTRAINT "CorrelationRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessService" ADD CONSTRAINT "BusinessService_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessService" ADD CONSTRAINT "BusinessService_zabbixInstanceId_fkey" FOREIGN KEY ("zabbixInstanceId") REFERENCES "ZabbixInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceComponent" ADD CONSTRAINT "ServiceComponent_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "BusinessService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlaReport" ADD CONSTRAINT "SlaReport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlaReport" ADD CONSTRAINT "SlaReport_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "BusinessService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
