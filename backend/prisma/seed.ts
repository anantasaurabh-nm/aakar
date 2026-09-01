import { PrismaClient, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { hash } from 'bcryptjs';
import { DEFAULT_ROLE_PERMISSIONS, type Role } from '../src/core/rbac/permission-catalog';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'Password123!';

const DEFAULT_SYSTEM_ROLES = [
  { key: 'SUPER_ADMIN', name: 'Super Admin', description: 'Full system and platform administration access' },
  { key: 'TENANT_ADMIN', name: 'Tenant Admin', description: 'Workspace administrator with full tenant control' },
  { key: 'MANAGER', name: 'Manager', description: 'Operational team lead with approvals and management access' },
  { key: 'STAFF', name: 'Staff', description: 'Standard operational team member' },
  { key: 'VIEWER', name: 'Viewer', description: 'Read-only access across enabled modules' },
];

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'doers-os' },
    create: { name: 'DoersOS', slug: 'doers-os' },
    update: {},
  });

  for (const role of DEFAULT_SYSTEM_ROLES) {
    await prisma.roleDefinition.upsert({
      where: { key: role.key },
      create: {
        id: role.key.toLowerCase(),
        key: role.key,
        name: role.name,
        description: role.description,
        isSystem: true,
      },
      update: {
        name: role.name,
        isSystem: true,
      },
    });
  }

  for (const [role, permissions] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    for (const permission of permissions) {
      await prisma.rolePermission.upsert({
        where: { role_permission: { role, permission } },
        create: { role, permission },
        update: {},
      });
    }
  }

  const passwordHash = await hash(DEMO_PASSWORD, 10);

  const demoUsers: Array<{ email: string; username: string; role: Role }> = [
    { email: 'admin@doers-os.internal', username: 'super.admin', role: 'SUPER_ADMIN' },
    { email: 'elena.rostova@doers.io', username: 'elena.rostova', role: 'TENANT_ADMIN' },
    { email: 'marcus.vance@doers.io', username: 'marcus.vance', role: 'MANAGER' },
    { email: 'sarah.connor@doers.io', username: 'sarah.connor', role: 'STAFF' },
    { email: 'rachel.adams@doers.io', username: 'rachel.adams', role: 'VIEWER' },
  ];

  const createdUsers: Record<string, string> = {};
  for (const u of demoUsers) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      create: { tenantId: tenant.id, email: u.email, username: u.username, passwordHash, role: u.role },
      update: {},
    });
    createdUsers[u.role] = user.id;
  }

  // todo_task is owned by the entity engine (public_html/modules/todo/schema.json),
  // not a Prisma model — only seed sample rows if the app has already
  // booted once and created the table (run this script again after
  // `npm run start:dev` if it hasn't yet).
  const tableExists = await prisma.$queryRaw<{ exists: boolean }[]>(
    Prisma.sql`SELECT to_regclass('public.todo_task') IS NOT NULL AS exists`,
  );
  if (tableExists[0]?.exists) {
    const staffId = createdUsers.STAFF!;
    const sampleTasks = [
      { title: 'Prepare quarterly report', priority: 'HIGH', category: 'Finance', daysOffset: 0 },
      { title: 'Call customer about renewal', priority: 'URGENT', category: 'Sales', daysOffset: 0 },
      { title: 'Review onboarding docs', priority: 'MEDIUM', category: 'HR', daysOffset: -1 },
      { title: 'Plan sprint retrospective', priority: 'LOW', category: 'Engineering', daysOffset: 1 },
      { title: 'Update security policy', priority: 'HIGH', category: 'Operations', daysOffset: -3 },
    ];

    for (const t of sampleTasks) {
      const existing = await prisma.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT id FROM todo_task WHERE tenant_id = ${tenant.id} AND title = ${t.title}`,
      );
      if (existing.length > 0) continue;

      const date = new Date();
      date.setDate(date.getDate() + t.daysOffset);
      const recordDate = new Date(date.toDateString());
      const status = t.daysOffset < 0 ? 'approved' : 'draft';

      await prisma.$executeRaw`
        INSERT INTO todo_task (id, tenant_id, record_date, record_status, title, priority, category, created_by, updated_by)
        VALUES (${randomUUID()}, ${tenant.id}, ${recordDate}, ${status}, ${t.title}, ${t.priority}, ${t.category}, ${staffId}, ${staffId})
      `;
    }
  } else {
    // eslint-disable-next-line no-console
    console.log('todo_task table not found yet — start the backend once, then re-run this seed to add sample tasks.');
  }

  // eslint-disable-next-line no-console
  console.log('Seed complete.');
  // eslint-disable-next-line no-console
  console.log(`Demo login: admin@doers-os.internal / ${DEMO_PASSWORD}`);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
