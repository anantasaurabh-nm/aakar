const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  console.log('Seeding Notification Lab (test-notifications)...');

  // 1. Get default tenant
  const tenant = await prisma.tenant.findFirst({
    where: { slug: 'doers-os' },
  });
  if (!tenant) {
    console.error('Tenant "doers-os" not found');
    return;
  }
  console.log('Tenant ID:', tenant.id);

  // 2. Get admin user
  const adminUser = await prisma.user.findFirst({
    where: { tenantId: tenant.id },
  });
  console.log('Admin User ID:', adminUser?.id, adminUser?.email);

  // 3. Upsert module in module_registry
  const moduleEntry = await prisma.moduleRegistryEntry.upsert({
    where: { id: 'test-notifications' },
    create: {
      id: 'test-notifications',
      name: 'Notification Lab',
      version: '1.0.0',
      description: 'Test and demonstrate multi-channel notification dispatches across In-App, Web Push, Email, WhatsApp, and SMS using record fields.',
      type: 'native',
      surfaces: ['app'],
      icon: 'bell',
      status: 'enabled',
    },
    update: {
      name: 'Notification Lab',
      surfaces: ['app'],
      icon: 'bell',
      status: 'enabled',
    },
  });
  console.log('Module registered:', moduleEntry.id, moduleEntry.status);

  // 4. Ensure permissions are granted for test-notifications
  const roles = ['SUPER_ADMIN', 'TENANT_ADMIN', 'MANAGER', 'STAFF', 'VIEWER'];
  const permissions = [
    'test-notifications.alert.read',
    'test-notifications.alert.create',
    'test-notifications.alert.update',
    'test-notifications.alert.delete',
  ];

  for (const role of roles) {
    for (const permission of permissions) {
      if (role === 'VIEWER' && !permission.endsWith('.read')) continue;
      await prisma.rolePermission.upsert({
        where: { role_permission: { role, permission } },
        create: { role, permission },
        update: {},
      });
    }
  }
  console.log('Permissions granted to roles');

  // 5. Ensure table test_notifications_alert exists
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS test_notifications_alert (
      id VARCHAR(64) PRIMARY KEY,
      tenant_id VARCHAR(64) NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      assigned_to VARCHAR(64),
      email VARCHAR(255),
      phone VARCHAR(64),
      priority VARCHAR(32) DEFAULT 'MEDIUM',
      type VARCHAR(32) DEFAULT 'informational',
      status VARCHAR(32) DEFAULT 'active',
      record_status VARCHAR(32) DEFAULT 'active',
      created_by VARCHAR(64),
      updated_by VARCHAR(64),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      record_date TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('Table test_notifications_alert ensured');

  // 6. Seed sample alerts
  const sampleAlerts = [
    {
      id: 'ALERT-001',
      title: 'Production Database High Memory Utilization (>92%)',
      description: 'The primary PostgreSQL cluster memory usage has exceeded 92% for 15 consecutive minutes. Immediate diagnostic check advised.',
      assigned_to: adminUser?.id || '',
      email: adminUser?.email || 'admin@doers-os.internal',
      phone: '+15550192834',
      priority: 'URGENT',
      type: 'warning',
    },
    {
      id: 'ALERT-002',
      title: 'Customer Payment Received: Invoice #INV-2024-88',
      description: 'Acme Corp has completed wire transfer payment of $14,500.00 for enterprise subscription renewal. Account status set to active.',
      assigned_to: adminUser?.id || '',
      email: 'finance-ops@doers-os.internal',
      phone: '+15550187654',
      priority: 'MEDIUM',
      type: 'success',
    },
    {
      id: 'ALERT-003',
      title: 'Security Notice: New Session from Unrecognized IP',
      description: 'A new web session was initiated for user super.admin from IP 198.51.100.42 (Frankfurt, DE). Tap to review active sessions.',
      assigned_to: adminUser?.id || '',
      email: adminUser?.email || 'admin@doers-os.internal',
      phone: '+15550192834',
      priority: 'HIGH',
      type: 'action_required',
    },
  ];

  for (const alert of sampleAlerts) {
    const existing = await prisma.$queryRawUnsafe(
      `SELECT id FROM test_notifications_alert WHERE tenant_id = $1 AND id = $2`,
      tenant.id,
      alert.id
    );

    if (existing.length === 0) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO test_notifications_alert (
          id, tenant_id, title, description, assigned_to, email, phone, priority, type, status, record_status, created_at, updated_at, record_date
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', 'active', NOW(), NOW(), NOW())`,
        alert.id,
        tenant.id,
        alert.title,
        alert.description,
        alert.assigned_to,
        alert.email,
        alert.phone,
        alert.priority,
        alert.type
      );
      console.log(`Inserted sample record ${alert.id}: ${alert.title}`);
    } else {
      console.log(`Sample record ${alert.id} already exists`);
    }
  }

  console.log('Seeding completed successfully!');
}

run()
  .catch((e) => {
    console.error('Error seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
