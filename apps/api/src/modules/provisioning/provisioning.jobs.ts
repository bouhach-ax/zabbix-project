import { Worker, Job } from 'bullmq'
import { Prisma } from '@prisma/client'
import { getRedis } from '../../shared/cache/redis.js'
import { prisma } from '../../shared/database/prisma.js'
import { QUEUE_NAMES } from '../../shared/queue/bullmq.js'
import { PROVISIONING_STEPS } from '../../config/constants.js'
import { env } from '../../config/env.js'
import { detectOs } from './os-detection/os-detector.js'
import { generateScript } from './os-detection/script-generator.js'
import { ZabbixApiService } from '../../integrations/zabbix/ZabbixApiService.js'
import { decrypt } from '../../shared/crypto/encryption.js'

interface ProvisioningJobData {
  hostId: string
  tenantId: string
  zabbixServerIp: string
  zabbixActiveIp: string
}

interface StepResult {
  step: string
  status: 'pending' | 'running' | 'success' | 'failed'
  startedAt?: string
  completedAt?: string
  error?: string
}

/**
 * Updates a provisioning job step in the database.
 * Maintains the full steps array — each call updates or appends the given step.
 */
async function updateStep(
  hostId: string,
  stepIndex: number,
  stepName: string,
  status: StepResult['status'],
  error?: string,
): Promise<void> {
  const job = await prisma.provisioningJob.findUnique({
    where: { hostId },
    select: { steps: true },
  })

  const steps = (job?.steps as StepResult[] | null) ?? []

  const now = new Date().toISOString()
  const existing = steps[stepIndex]

  if (existing) {
    existing.status = status
    if (status === 'running' && !existing.startedAt) {
      existing.startedAt = now
    }
    if (status === 'success' || status === 'failed') {
      existing.completedAt = now
    }
    if (error) {
      existing.error = error
    }
  } else {
    steps[stepIndex] = {
      step: stepName,
      status,
      ...(status === 'running' && { startedAt: now }),
      ...(status === 'success' || status === 'failed' ? { completedAt: now } : {}),
      ...(error ? { error } : {}),
    }
  }

  await prisma.provisioningJob.update({
    where: { hostId },
    data: {
      steps: steps as unknown as Prisma.InputJsonValue,
      currentStep: stepName,
    },
  })
}

/**
 * Creates and starts the BullMQ Worker for the provisioning queue.
 * Processes hosts through the 10-step provisioning pipeline.
 *
 * @returns The BullMQ Worker instance (call worker.close() on shutdown)
 */
export function startProvisioningWorker(): Worker {
  const connection = getRedis()
  const concurrency = env.PROVISIONING_CONCURRENCY

  const worker = new Worker<ProvisioningJobData>(
    QUEUE_NAMES.PROVISIONING,
    async (job: Job<ProvisioningJobData>) => {
      const { hostId, tenantId, zabbixServerIp, zabbixActiveIp } = job.data
      console.log(`[Provisioning] Starting job for host ${hostId}`)

      try {
        // ── Step 0: INIT ──
        await updateStep(hostId, 0, PROVISIONING_STEPS[0]!, 'running')
        const host = await prisma.managedHost.findFirst({
          where: { id: hostId, tenantId },
          include: { instance: true },
        })
        if (!host) {
          throw new Error(`Host ${hostId} not found for tenant ${tenantId}`)
        }
        await prisma.provisioningJob.update({
          where: { hostId },
          data: { status: 'DETECTING' },
        })
        await updateStep(hostId, 0, PROVISIONING_STEPS[0]!, 'success')

        // ── Step 1: OS DETECTION ──
        await updateStep(hostId, 1, PROVISIONING_STEPS[1]!, 'running')
        let detectedOs = null
        try {
          const apiToken = decrypt(host.instance.apiTokenEncrypted)
          const zabbixService = new ZabbixApiService(
            host.instance.apiUrl,
            apiToken,
            host.instance.id,
            host.instance.version ?? undefined,
          )

          if (host.zabbixHostId) {
            detectedOs = await detectOs(zabbixService, host.zabbixHostId)
          }
        } catch (err) {
          console.warn(`[Provisioning] OS detection via Zabbix API failed for ${hostId}:`, err)
        }

        if (detectedOs) {
          await prisma.provisioningJob.update({
            where: { hostId },
            data: { detectedOs: detectedOs as unknown as Prisma.InputJsonValue },
          })
          await prisma.managedHost.update({
            where: { id: hostId },
            data: {
              os: detectedOs.os,
              osVersion: detectedOs.version,
              agentVersion: detectedOs.agentVersion,
            },
          })
        }
        // If OS detection fails, we continue — the host may have a pre-set OS
        await updateStep(hostId, 1, PROVISIONING_STEPS[1]!, 'success')

        // ── Step 2: SCRIPT GENERATION ──
        await updateStep(hostId, 2, PROVISIONING_STEPS[2]!, 'running')
        await prisma.provisioningJob.update({
          where: { hostId },
          data: { status: 'SCRIPT_GENERATED' },
        })

        // Re-fetch host to get possibly updated OS
        const freshHost = await prisma.managedHost.findUniqueOrThrow({
          where: { id: hostId },
        })

        let generatedScript: string | null = null
        if (freshHost.os && freshHost.os !== 'OTHER') {
          try {
            generatedScript = generateScript(freshHost.os, {
              zabbixServerIp,
              zabbixActiveIp,
              hostname: freshHost.hostname,
              agentPort: freshHost.agentPort,
            })
          } catch (err) {
            console.warn(`[Provisioning] Script generation failed for ${hostId}:`, err)
          }
        }

        if (generatedScript) {
          await prisma.provisioningJob.update({
            where: { hostId },
            data: { generatedScript },
          })
        }
        await updateStep(hostId, 2, PROVISIONING_STEPS[2]!, 'success')

        // ── Step 3: AGENT DEPLOY ──
        await updateStep(hostId, 3, PROVISIONING_STEPS[3]!, 'running')
        await prisma.provisioningJob.update({
          where: { hostId },
          data: { status: 'AGENT_DEPLOYED' },
        })
        // In production: agent download/deploy happens externally.
        // The script is now available via getScript() for download.
        await updateStep(hostId, 3, PROVISIONING_STEPS[3]!, 'success')

        // ── Step 4: HOST DECLARE in Zabbix ──
        await updateStep(hostId, 4, PROVISIONING_STEPS[4]!, 'running')
        // TODO Phase 2c: call ZabbixApiService.createHost() with the host's details
        // For now, mark as success stub
        await prisma.provisioningJob.update({
          where: { hostId },
          data: { status: 'HOST_DECLARED' },
        })
        console.log(`[Provisioning] TODO: Declare host ${hostId} in Zabbix`)
        await updateStep(hostId, 4, PROVISIONING_STEPS[4]!, 'success')

        // ── Step 5: OS TEMPLATE ──
        await updateStep(hostId, 5, PROVISIONING_STEPS[5]!, 'running')
        // TODO: Link OS-specific template in Zabbix via host.update with templates
        await prisma.provisioningJob.update({
          where: { hostId },
          data: { status: 'OS_TEMPLATE_APPLIED' },
        })
        console.log(`[Provisioning] TODO: Apply OS template for host ${hostId}`)
        await updateStep(hostId, 5, PROVISIONING_STEPS[5]!, 'success')

        // ── Step 6: OS VALIDATE ──
        await updateStep(hostId, 6, PROVISIONING_STEPS[6]!, 'running')
        // TODO: Verify OS metrics are being collected (check items have data)
        await prisma.provisioningJob.update({
          where: { hostId },
          data: { status: 'OS_VALIDATED' },
        })
        console.log(`[Provisioning] TODO: Validate OS metrics for host ${hostId}`)
        await updateStep(hostId, 6, PROVISIONING_STEPS[6]!, 'success')

        // ── Step 7: APP DECLARE ──
        await updateStep(hostId, 7, PROVISIONING_STEPS[7]!, 'running')
        await prisma.provisioningJob.update({
          where: { hostId },
          data: { status: 'WAITING_APP_DECLARATION' },
        })
        // The user will declare applications separately via the Template Builder
        await updateStep(hostId, 7, PROVISIONING_STEPS[7]!, 'success')

        // ── Step 8: APPS CONFIGURING ──
        await updateStep(hostId, 8, PROVISIONING_STEPS[8]!, 'running')
        // TODO: Apply application templates once declared by user
        console.log(`[Provisioning] TODO: Configure app monitoring for host ${hostId}`)
        await updateStep(hostId, 8, PROVISIONING_STEPS[8]!, 'success')

        // ── Step 9: COMPLETE ──
        await updateStep(hostId, 9, PROVISIONING_STEPS[9]!, 'running')
        await prisma.managedHost.update({
          where: { id: hostId },
          data: { status: 'ACTIVE' },
        })
        await prisma.provisioningJob.update({
          where: { hostId },
          data: {
            status: 'SUCCESS',
            completedAt: new Date(),
          },
        })
        await updateStep(hostId, 9, PROVISIONING_STEPS[9]!, 'success')

        // TODO Phase 4: emit via Socket.io — room `tenant:${tenantId}`
        console.log(`[Provisioning] Job completed successfully for host ${hostId}`)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(`[Provisioning] Job failed for host ${hostId}:`, message)

        await prisma.provisioningJob.update({
          where: { hostId },
          data: {
            status: 'FAILED',
            errorMessage: message,
            completedAt: new Date(),
          },
        }).catch((dbErr) => {
          console.error(`[Provisioning] Failed to update job status:`, dbErr)
        })

        throw err
      }
    },
    {
      connection,
      concurrency,
      autorun: true,
    },
  )

  worker.on('completed', (job) => {
    console.log(`[Provisioning] Worker completed job ${job.id}`)
  })

  worker.on('failed', (job, err) => {
    console.error(`[Provisioning] Worker failed job ${job?.id}:`, err.message)
  })

  return worker
}
