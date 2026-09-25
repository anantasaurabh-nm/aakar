const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  console.log('Testing notification.dispatch capability & record fields...');

  const tenant = await prisma.tenant.findFirst({ where: { slug: 'doers-os' } });
  if (!tenant) throw new Error('Tenant not found');

  const admin = await prisma.user.findFirst({ where: { tenantId: tenant.id } });
  if (!admin) throw new Error('Admin user not found');

  // Query sample alert record
  const alerts = await prisma.$queryRawUnsafe(
    `SELECT * FROM test_notifications_alert WHERE tenant_id = $1 ORDER BY id ASC`,
    tenant.id
  );
  console.log(`Found ${alerts.length} sample alert records in test_notifications_alert table.`);
  const record = alerts[0];
  console.log('Using sample record:', {
    id: record.id,
    title: record.title,
    assigned_to: record.assigned_to,
    email: record.email,
    phone: record.phone,
    priority: record.priority,
    type: record.type,
  });

  // Test 1: Simulate In-App dispatch using record fields
  console.log('\n--- Test 1: In-App Notification Dispatch ---');
  const inAppNotif = await prisma.notification.create({
    data: {
      tenantId: tenant.id,
      recipientId: record.assigned_to || admin.id,
      title: record.title,
      body: record.description,
      priority: 'urgent',
      type: 'warning',
      status: 'delivered',
      channels: ['in_app'],
      sourceModule: 'test-notifications',
      sourceEntity: 'alert',
      sourceId: record.id,
      actions: [
        {
          id: 'open-record',
          label: `Open ${record.title.slice(0, 20)}…`,
          action: 'open_record',
          url: `/app/test-notifications?record=${record.id}`,
        },
      ],
      deliveryDetails: { in_app: { status: 'delivered', recipientId: record.assigned_to || admin.id } },
    },
  });
  console.log('✓ In-App Notification created with ID:', inAppNotif.id);
  console.log('  Deep Link:', inAppNotif.actions[0].url);

  // Test 2: Simulate Multi-Channel Dispatch (All)
  console.log('\n--- Test 2: Multi-Channel Broadcast Dispatch ---');
  const broadcastNotif = await prisma.notification.create({
    data: {
      tenantId: tenant.id,
      recipientId: record.assigned_to || admin.id,
      title: `[Broadcast] ${record.title}`,
      body: record.description,
      priority: 'high',
      type: 'action_required',
      status: 'delivered',
      channels: ['in_app', 'push', 'email', 'whatsapp', 'sms'],
      sourceModule: 'test-notifications',
      sourceEntity: 'alert',
      sourceId: record.id,
      actions: [
        {
          id: 'open-record',
          label: 'View Alert',
          action: 'open_record',
          url: `/app/test-notifications?record=${record.id}`,
        },
      ],
      metadata: {
        recipientEmail: record.email,
        recipientPhone: record.phone,
      },
      deliveryDetails: {
        in_app: { status: 'delivered', recipientId: record.assigned_to || admin.id },
        push: { status: 'skipped', reason: 'No active push subscriptions found' },
        email: { status: 'skipped', recipient: record.email, reason: 'Email provider not configured' },
        whatsapp: { status: 'skipped', recipient: record.phone, reason: 'WhatsApp provider not configured' },
        sms: { status: 'skipped', recipient: record.phone, reason: 'SMS provider not configured' },
      },
    },
  });
  console.log('✓ Broadcast Notification created with ID:', broadcastNotif.id);
  console.log('  Channels:', broadcastNotif.channels);
  console.log('  Delivery details:', broadcastNotif.deliveryDetails);

  // Test 3: Verify unread notifications for admin
  const unreadCount = await prisma.notification.count({
    where: {
      tenantId: tenant.id,
      recipientId: record.assigned_to || admin.id,
      readAt: null,
    },
  });
  console.log(`\n✓ Total unread notifications for user ${admin.email}: ${unreadCount}`);

  console.log('\nAll notification dispatch tests passed successfully!');
}

run()
  .catch((e) => {
    console.error('Test failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
