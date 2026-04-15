import { PrismaClient, PlanType, UserRole } from '@prisma/client'
import { createHash } from 'crypto'

const prisma = new PrismaClient()

/**
 * Seed script — creates a default admin tenant and user for development
 * Usage: npx prisma db seed
 */
async function main(): Promise<void> {
  console.info('Seeding database...')

  // Create dev tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'dev-tenant' },
    update: {},
    create: {
      name: 'Dev Tenant',
      slug: 'dev-tenant',
      plan: PlanType.ENTERPRISE,
      isActive: true,
      maxHosts: 9999,
      maxInstances: 10,
    },
  })

  console.info(`Tenant: ${tenant.name} (${tenant.id})`)

  // Create admin user — password: 'admin123' (bcrypt hash placeholder for seed)
  // In real usage, use bcrypt with factor 12
  const passwordHash = createHash('sha256').update('admin123').digest('hex')

  const adminUser = await prisma.user.upsert({
    where: {
      tenantId_email: {
        tenantId: tenant.id,
        email: 'admin@zabbixpilot.dev',
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'admin@zabbixpilot.dev',
      passwordHash,
      firstName: 'Admin',
      lastName: 'ZabbixPilot',
      role: UserRole.ADMIN,
      isActive: true,
    },
  })

  console.info(`Admin user: ${adminUser.email} (${adminUser.id})`)

  console.info('Seeding complete.')
}

main()
  .catch((e) => {
    console.error('Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
