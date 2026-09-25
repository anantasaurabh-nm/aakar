import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { NotificationsService } from '../../core/notifications/notifications.service';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../core/auth/authenticated-user.interface';
import { PermissionsGuard } from '../../core/rbac/permissions.guard';
import { RequirePermissions } from '../../core/rbac/require-permissions.decorator';
import { CapabilityRegistry } from '../../core/capabilities/capability-registry.service';
import { SDUI_SCHEMA_VERSION } from '@erp/shared-contracts';
import type { NotificationSendInput } from '@erp/shared-contracts';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class NotificationsController implements OnModuleInit {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly capabilityRegistry: CapabilityRegistry,
  ) {}

  onModuleInit() {
    // 1. notification.send capability
    this.capabilityRegistry.register(
      {
        id: 'notification.send',
        module: 'notifications',
        entity: 'notification',
        requiredPermission: 'notifications.send',
        description: 'Send a notification to an authorized recipient through configured communication channels.',
      },
      async (params, ctx) => {
        const input = params as unknown as NotificationSendInput;
        const res = await this.notificationsService.send(input, ctx.user.tenantId, ctx.user.id);
        return {
          module: 'notifications',
          entity: 'notification',
          operation: 'send',
          rows: res.record ? [res.record as unknown as Record<string, unknown>] : [],
          details: res.deliveryDetails,
        };
      },
    );

    // Alias: notifications.send
    this.capabilityRegistry.register(
      {
        id: 'notifications.send',
        module: 'notifications',
        entity: 'notification',
        requiredPermission: 'notifications.send',
        description: 'Send a notification to an authorized recipient through configured communication channels.',
      },
      async (params, ctx) => {
        const input = params as unknown as NotificationSendInput;
        const res = await this.notificationsService.send(input, ctx.user.tenantId, ctx.user.id);
        return {
          module: 'notifications',
          entity: 'notification',
          operation: 'send',
          rows: res.record ? [res.record as unknown as Record<string, unknown>] : [],
          details: res.deliveryDetails,
        };
      },
    );

    // 2. notification.send_batch capability
    this.capabilityRegistry.register(
      {
        id: 'notification.send_batch',
        module: 'notifications',
        entity: 'notification',
        requiredPermission: 'notifications.send',
        description: 'Send a batch of notifications to multiple recipients or across multiple events.',
      },
      async (params, ctx) => {
        const inputs = (params.notifications ?? params.items ?? []) as NotificationSendInput[];
        const res = await this.notificationsService.sendBatch(inputs, ctx.user.tenantId, ctx.user.id);
        return {
          module: 'notifications',
          entity: 'notification',
          operation: 'send_batch',
          total: res.total,
          successful: res.successful,
          failed: res.failed,
          rows: res.results as unknown as Record<string, unknown>[],
        };
      },
    );

    // 3. notification.list capability
    this.capabilityRegistry.register(
      {
        id: 'notification.list',
        module: 'notifications',
        entity: 'notification',
        requiredPermission: 'notifications.read',
        description: 'List notifications for the current user or tenant with unread filtering.',
      },
      async (params, ctx) => {
        const unreadOnly = Boolean(params.unreadOnly ?? params.unread_only);
        const limit = Number(params.limit ?? 50);
        const result = await this.notificationsService.list(ctx.user.tenantId, ctx.user.id, { unreadOnly, limit });
        return {
          module: 'notifications',
          entity: 'notification',
          operation: 'list',
          rows: result.items as unknown as Record<string, unknown>[],
          total: result.total,
          unread: result.unread,
        };
      },
    );

    // 4. notification.count_unread capability
    this.capabilityRegistry.register(
      {
        id: 'notification.count_unread',
        module: 'notifications',
        entity: 'notification',
        requiredPermission: 'notifications.read',
        description: 'Get the total unread notification count for the authenticated user.',
      },
      async (_params, ctx) => {
        const count = await this.notificationsService.countUnread(ctx.user.tenantId, ctx.user.id);
        return {
          module: 'notifications',
          entity: 'notification',
          operation: 'count_unread',
          count,
        };
      },
    );

    // 5. notification.mark_read capability
    this.capabilityRegistry.register(
      {
        id: 'notification.mark_read',
        module: 'notifications',
        entity: 'notification',
        requiredPermission: 'notifications.read',
        description: 'Mark a notification as read.',
      },
      async (params, ctx) => {
        const id = String(params.id ?? '').trim();
        if (!id) throw new BadRequestException('Notification id is required');
        const updated = await this.notificationsService.markRead(ctx.user.tenantId, id, ctx.user.id);
        return {
          module: 'notifications',
          entity: 'notification',
          operation: 'mark_read',
          rows: [updated as unknown as Record<string, unknown>],
        };
      },
    );

    // 6. notification.mark_unread capability
    this.capabilityRegistry.register(
      {
        id: 'notification.mark_unread',
        module: 'notifications',
        entity: 'notification',
        requiredPermission: 'notifications.read',
        description: 'Mark a notification as unread.',
      },
      async (params, ctx) => {
        const id = String(params.id ?? '').trim();
        if (!id) throw new BadRequestException('Notification id is required');
        const updated = await this.notificationsService.markUnread(ctx.user.tenantId, id, ctx.user.id);
        return {
          module: 'notifications',
          entity: 'notification',
          operation: 'mark_unread',
          rows: [updated as unknown as Record<string, unknown>],
        };
      },
    );

    // 7. notification.dispatch capability (Dispatches notification from record fields)
    this.capabilityRegistry.register(
      {
        id: 'notification.dispatch',
        module: 'notifications',
        entity: 'notification',
        requiredPermission: 'notifications.send',
        description: 'Dispatch a multi-channel notification using live record fields (title, description, assigned_to, email, phone).',
      },
      async (params, ctx) => {
        const res = await this.dispatchRecordNotification(params as Record<string, unknown>, ctx.user);
        return {
          module: 'notifications',
          entity: 'notification',
          operation: 'dispatch',
          rows: res.notification ? [res.notification as unknown as Record<string, unknown>] : [],
          details: res.deliveryDetails,
          message: res.message,
          success: res.success,
        };
      },
    );

    this.capabilityRegistry.register(
      {
        id: 'notification.dispatch_record',
        module: 'notifications',
        entity: 'notification',
        requiredPermission: 'notifications.send',
        description: 'Dispatch a multi-channel notification using live record fields.',
      },
      async (params, ctx) => {
        const res = await this.dispatchRecordNotification(params as Record<string, unknown>, ctx.user);
        return {
          module: 'notifications',
          entity: 'notification',
          operation: 'dispatch_record',
          rows: res.notification ? [res.notification as unknown as Record<string, unknown>] : [],
          details: res.deliveryDetails,
          message: res.message,
          success: res.success,
        };
      },
    );
  }

  /**
   * Declarative SDUI Administrative & App Page: /admin/notifications and /app/notifications
   */
  @Get('ui/pages/admin/notifications')
  @Get('ui/pages/app/notifications')
  @RequirePermissions('notifications.read')
  async getAdminPage(@CurrentUser() user: AuthenticatedUser) {
    const [configs, notifList] = await Promise.all([
      this.notificationsService.getChannelConfigs(user.tenantId),
      this.notificationsService.list(user.tenantId, undefined, { limit: 100 }),
    ]);

    const emailConfig = configs.find((c) => c.channel === 'email');
    const pushConfig = configs.find((c) => c.channel === 'push');
    const waConfig = configs.find((c) => c.channel === 'whatsapp');
    const smsConfig = configs.find((c) => c.channel === 'sms');

    const emailCfg = emailConfig?.configuration ?? {};
    const pushCfg = pushConfig?.configuration ?? {};
    const waCfg = waConfig?.configuration ?? {};
    const smsCfg = smsConfig?.configuration ?? {};

    return {
      schema: SDUI_SCHEMA_VERSION,
      brand: {
        name: 'Notifications & Alerts',
        icon: 'bell',
      },
      navigation: {
        items: [
          {
            id: 'nav-perspectives',
            label: 'Perspectives',
            icon: 'layout',
            items: [
              {
                id: 'persp-overview',
                label: 'System Overview',
                icon: 'activity',
                action: { type: 'navigate', target: '#overview' },
              },
              {
                id: 'persp-log',
                label: 'Notification Logs',
                icon: 'bell',
                badge: String(notifList.total),
                action: { type: 'navigate', target: '#all-notifications' },
              },
              {
                id: 'persp-email',
                label: 'Email (SMTP & Providers)',
                icon: 'mail',
                action: { type: 'navigate', target: '#channel-email' },
              },
              {
                id: 'persp-push',
                label: 'Web Push (PWA)',
                icon: 'smartphone',
                action: { type: 'navigate', target: '#channel-push' },
              },
              {
                id: 'persp-whatsapp',
                label: 'WhatsApp Business',
                icon: 'message-circle',
                action: { type: 'navigate', target: '#channel-whatsapp' },
              },
              {
                id: 'persp-sms',
                label: 'SMS Messaging',
                icon: 'message-square',
                action: { type: 'navigate', target: '#channel-sms' },
              },
            ],
          },
          {
            id: 'nav-bridges',
            label: 'Admin Hub',
            icon: 'shield',
            items: [
              {
                id: 'bridge-connectors',
                label: 'Connectors & APIs',
                icon: 'sparkles',
                action: { type: 'navigate', target: '/admin/connectors' },
              },
              {
                id: 'bridge-ai',
                label: 'AI Configuration',
                icon: 'ai',
                action: { type: 'navigate', target: '/admin/ai-configuration' },
              },
              {
                id: 'bridge-modules',
                label: 'Installed Modules',
                icon: 'modules',
                action: { type: 'navigate', target: '/admin/module-management' },
              },
            ],
          },
        ],
      },
      page: {
        id: 'notifications',
        title: 'Notifications & Alerts',
        sections: [
          {
            id: 'overview',
            label: 'Channel Health & System Overview',
            type: 'dashboard',
            config: {
              cards: [
                {
                  id: 'card-total-sent',
                  label: 'Total Sent',
                  value: notifList.total,
                  accent: 'indigo',
                },
                {
                  id: 'card-unread',
                  label: 'Unread (In-App)',
                  value: notifList.unread,
                  accent: 'amber',
                },
                {
                  id: 'card-email-status',
                  label: 'Email (SMTP)',
                  value: emailConfig?.isEnabled ? 'Active' : 'Disabled',
                  accent: emailConfig?.isEnabled ? 'emerald' : 'slate',
                },
                {
                  id: 'card-push-status',
                  label: 'Web Push',
                  value: pushConfig?.isEnabled ? 'Active' : 'Configured',
                  accent: pushConfig?.isEnabled ? 'cyan' : 'slate',
                },
              ],
              charts: [],
            },
          },
          {
            id: 'all-notifications',
            label: 'Notification Logs',
            type: 'table',
            data: { source: 'notifications.list' },
            config: {
              columns: [
                { key: 'title', label: 'Title', type: 'text', sortable: true },
                { key: 'type', label: 'Type', type: 'badge', sortable: true },
                { key: 'priority', label: 'Priority', type: 'badge', sortable: true },
                { key: 'status', label: 'Status', type: 'badge', sortable: true },
                { key: 'channels', label: 'Channels', type: 'tags' },
                { key: 'createdAt', label: 'Created At', type: 'datetime', sortable: true },
              ],
              selectable: false,
              pageSize: 50,
              density: 'comfortable',
            },
            toolbar: [
              { id: 'search', type: 'search' },
              {
                id: 'filter-type',
                type: 'filter',
                field: 'type',
                options: [
                  { label: 'All Types', value: '' },
                  { label: 'Informational', value: 'informational' },
                  { label: 'Action Required', value: 'action_required' },
                  { label: 'Warning', value: 'warning' },
                  { label: 'Success', value: 'success' },
                  { label: 'Error', value: 'error' },
                  { label: 'System', value: 'system' },
                ],
              },
              { id: 'send-sample', type: 'action', label: 'Trigger Test Alert', action: { type: 'submit', target: 'notifications.test-sample' } },
              { id: 'refresh', type: 'action', label: 'Refresh', action: { type: 'refresh' } },
            ],
          },
          {
            id: 'channel-email',
            label: 'Email (SMTP & Providers)',
            type: 'form',
            toolbar: [
              { id: 'test-email', type: 'action', label: 'Test Connection', action: { type: 'submit', target: 'notifications.test' } },
              { id: 'save-email', type: 'action', label: 'Save Email Settings', action: { type: 'submit' } },
            ],
            state: {
              channel: 'email',
              provider: emailConfig?.provider ?? 'smtp',
              isEnabled: emailConfig?.isEnabled ?? true,
              host: emailCfg.host ?? '',
              port: emailCfg.port ?? 587,
              secure: emailCfg.secure ?? false,
              user: emailCfg.user ?? '',
              password: emailConfig?.hasSecrets ? '••••••••' : '',
              fromEmail: emailCfg.fromEmail ?? '',
              fromName: emailCfg.fromName ?? 'DoersOS',
              resendApiKey: emailConfig?.hasSecrets ? '••••••••' : '',
            },
            config: {
              title: 'Email Configuration',
              description: 'Configure connection details for your custom SMTP mail server or Resend API',
              submitAction: {
                type: 'submit',
                target: 'notifications.channel.save',
                label: 'Save Email Settings',
              },
              layout: {
                type: 'grid',
                columns: 2,
                groups: [
                  {
                    id: 'email-provider-group',
                    title: 'Email Provider Selection',
                    description: 'Choose your transport provider for sending transactional emails',
                    columns: 2,
                    fields: ['channel', 'provider', 'isEnabled'],
                  },
                  {
                    id: 'smtp-group',
                    title: 'SMTP Server Parameters',
                    description: 'Configure connection details for your custom SMTP mail server',
                    columns: 2,
                    fields: ['host', 'port', 'secure', 'user', 'password', 'fromEmail', 'fromName'],
                    showWhen: { field: 'provider', operator: 'eq', value: 'smtp' },
                  },
                  {
                    id: 'resend-group',
                    title: 'Resend API Parameters',
                    description: 'Modern developer transactional email via resend.com',
                    columns: 2,
                    fields: ['resendApiKey', 'fromEmail', 'fromName'],
                    showWhen: { field: 'provider', operator: 'eq', value: 'resend' },
                  },
                ],
              },
              fields: [
                { name: 'channel', label: 'Channel', type: 'hidden', defaultValue: 'email' },
                {
                  name: 'provider',
                  label: 'Email Provider',
                  type: 'select',
                  options: [
                    { label: 'Standard SMTP Server', value: 'smtp' },
                    { label: 'Resend (Modern REST API)', value: 'resend' },
                  ],
                  required: true,
                  defaultValue: emailConfig?.provider ?? 'smtp',
                },
                { name: 'isEnabled', label: 'Channel Enabled', type: 'switch', defaultValue: emailConfig?.isEnabled ?? true },
                { name: 'host', label: 'SMTP Hostname', type: 'text', placeholder: 'smtp.gmail.com / mail.example.com', defaultValue: emailCfg.host ?? '' },
                { name: 'port', label: 'SMTP Port', type: 'number', placeholder: '587', defaultValue: emailCfg.port ?? 587 },
                { name: 'secure', label: 'Use SSL/TLS (Port 465)', type: 'switch', defaultValue: emailCfg.secure ?? false },
                { name: 'user', label: 'Username / Email', type: 'text', placeholder: 'notifications@domain.com', defaultValue: emailCfg.user ?? '' },
                { name: 'password', label: 'Password / App Password', type: 'password', secret: true, placeholder: emailConfig?.hasSecrets ? '••••••••' : 'Enter password' },
                { name: 'fromEmail', label: 'Sender Email Address', type: 'text', placeholder: 'no-reply@domain.com', defaultValue: emailCfg.fromEmail ?? '' },
                { name: 'fromName', label: 'Sender Display Name', type: 'text', placeholder: 'DoersOS System', defaultValue: emailCfg.fromName ?? 'DoersOS' },
                { name: 'resendApiKey', label: 'Resend API Key', type: 'password', secret: true, placeholder: emailConfig?.hasSecrets ? '••••••••' : 're_••••' },
              ],
            },
          },
          {
            id: 'channel-push',
            label: 'Web Push (PWA)',
            type: 'form',
            toolbar: [
              { id: 'test-push', type: 'action', label: 'Send Test Push', action: { type: 'submit', target: 'notifications.test' } },
              { id: 'save-push', type: 'action', label: 'Save Push Settings', action: { type: 'submit' } },
            ],
            state: {
              channel: 'push',
              provider: 'webpush',
              isEnabled: pushConfig?.isEnabled ?? true,
              vapidPublicKey: pushCfg.vapidPublicKey ?? '',
              vapidPrivateKey: pushConfig?.hasSecrets ? '••••••••' : '',
              vapidSubject: pushCfg.vapidSubject ?? 'mailto:notifications@doers-os.internal',
            },
            config: {
              title: 'PWA Web Push (VAPID) Settings',
              description: 'Push notification parameters for browser and installed PWA app alerts',
              submitAction: {
                type: 'submit',
                target: 'notifications.channel.save',
                label: 'Save Push Settings',
              },
              layout: {
                type: 'grid',
                columns: 1,
                groups: [
                  {
                    id: 'push-group',
                    title: 'PWA Web Push (VAPID) Settings',
                    description: 'Push notification parameters for browser and installed PWA app alerts',
                    columns: 1,
                    fields: ['channel', 'provider', 'isEnabled', 'vapidSubject', 'vapidPublicKey', 'vapidPrivateKey'],
                  },
                ],
              },
              fields: [
                { name: 'channel', label: 'Channel', type: 'hidden', defaultValue: 'push' },
                { name: 'provider', label: 'Provider', type: 'hidden', defaultValue: 'webpush' },
                { name: 'isEnabled', label: 'Enable Web Push', type: 'switch', defaultValue: pushConfig?.isEnabled ?? true },
                { name: 'vapidSubject', label: 'Contact Subject URI', type: 'text', placeholder: 'mailto:admin@domain.com', defaultValue: pushCfg.vapidSubject ?? 'mailto:notifications@doers-os.internal' },
                { name: 'vapidPublicKey', label: 'VAPID Public Key', type: 'text', placeholder: 'BEl62i...', defaultValue: pushCfg.vapidPublicKey ?? '' },
                { name: 'vapidPrivateKey', label: 'VAPID Private Key', type: 'password', secret: true, placeholder: pushConfig?.hasSecrets ? '••••••••' : 'Enter VAPID private key' },
              ],
            },
          },
          {
            id: 'channel-whatsapp',
            label: 'WhatsApp Business',
            type: 'form',
            toolbar: [
              { id: 'test-wa', type: 'action', label: 'Test WhatsApp API', action: { type: 'submit', target: 'notifications.test' } },
              { id: 'save-wa', type: 'action', label: 'Save WhatsApp Settings', action: { type: 'submit' } },
            ],
            state: {
              channel: 'whatsapp',
              provider: waConfig?.provider ?? 'meta_whatsapp',
              isEnabled: waConfig?.isEnabled ?? false,
              phoneNumberId: waCfg.phoneNumberId ?? '',
              businessAccountId: waCfg.businessAccountId ?? '',
              accessToken: waConfig?.hasSecrets ? '••••••••' : '',
              accountSid: waCfg.accountSid ?? '',
              authToken: waConfig?.hasSecrets ? '••••••••' : '',
              fromNumber: waCfg.fromNumber ?? '',
            },
            config: {
              title: 'WhatsApp Business Configuration',
              description: 'Configure Meta Cloud API or Twilio WhatsApp service',
              submitAction: {
                type: 'submit',
                target: 'notifications.channel.save',
                label: 'Save WhatsApp Settings',
              },
              layout: {
                type: 'grid',
                columns: 2,
                groups: [
                  {
                    id: 'wa-provider-group',
                    title: 'WhatsApp Provider Selection',
                    description: 'Select Meta Cloud API or Twilio WhatsApp service',
                    columns: 2,
                    fields: ['channel', 'provider', 'isEnabled'],
                  },
                  {
                    id: 'meta-wa-group',
                    title: 'Meta WhatsApp Cloud API',
                    description: 'Official Meta Graph API credentials for WhatsApp Business Platform',
                    columns: 2,
                    fields: ['phoneNumberId', 'businessAccountId', 'accessToken'],
                    showWhen: { field: 'provider', operator: 'eq', value: 'meta_whatsapp' },
                  },
                  {
                    id: 'twilio-wa-group',
                    title: 'Twilio WhatsApp API',
                    description: 'Twilio messaging service credentials for WhatsApp',
                    columns: 2,
                    fields: ['accountSid', 'authToken', 'fromNumber'],
                    showWhen: { field: 'provider', operator: 'eq', value: 'twilio_whatsapp' },
                  },
                ],
              },
              fields: [
                { name: 'channel', label: 'Channel', type: 'hidden', defaultValue: 'whatsapp' },
                {
                  name: 'provider',
                  label: 'WhatsApp Provider',
                  type: 'select',
                  options: [
                    { label: 'Meta WhatsApp Cloud API', value: 'meta_whatsapp' },
                    { label: 'Twilio WhatsApp API', value: 'twilio_whatsapp' },
                  ],
                  required: true,
                  defaultValue: waConfig?.provider ?? 'meta_whatsapp',
                },
                { name: 'isEnabled', label: 'Enable WhatsApp Channel', type: 'switch', defaultValue: waConfig?.isEnabled ?? false },
                { name: 'phoneNumberId', label: 'Phone Number ID', type: 'text', placeholder: '109876543210', defaultValue: waCfg.phoneNumberId ?? '' },
                { name: 'businessAccountId', label: 'WhatsApp Business Account ID', type: 'text', placeholder: '209876543210', defaultValue: waCfg.businessAccountId ?? '' },
                { name: 'accessToken', label: 'Permanent Access Token', type: 'password', secret: true, placeholder: waConfig?.hasSecrets ? '••••••••' : 'Enter access token' },
                { name: 'accountSid', label: 'Twilio Account SID', type: 'text', placeholder: 'AC••••', defaultValue: waCfg.accountSid ?? '' },
                { name: 'authToken', label: 'Twilio Auth Token', type: 'password', secret: true, placeholder: waConfig?.hasSecrets ? '••••••••' : 'Enter auth token' },
                { name: 'fromNumber', label: 'Twilio WhatsApp Sender Number', type: 'text', placeholder: 'whatsapp:+14155238886', defaultValue: waCfg.fromNumber ?? '' },
              ],
            },
          },
          {
            id: 'channel-sms',
            label: 'SMS Messaging',
            type: 'form',
            toolbar: [
              { id: 'test-sms', type: 'action', label: 'Test SMS Channel', action: { type: 'submit', target: 'notifications.test' } },
              { id: 'save-sms', type: 'action', label: 'Save SMS Settings', action: { type: 'submit' } },
            ],
            state: {
              channel: 'sms',
              provider: 'twilio',
              isEnabled: smsConfig?.isEnabled ?? false,
              accountSid: smsCfg.accountSid ?? '',
              authToken: smsConfig?.hasSecrets ? '••••••••' : '',
              fromNumber: smsCfg.fromNumber ?? '',
            },
            config: {
              title: 'SMS Messaging Configuration',
              description: 'Configure Twilio SMS messaging service',
              submitAction: {
                type: 'submit',
                target: 'notifications.channel.save',
                label: 'Save SMS Settings',
              },
              layout: {
                type: 'grid',
                columns: 2,
                groups: [
                  {
                    id: 'sms-group',
                    title: 'Twilio SMS Credentials',
                    description: 'Direct SMS delivery for critical alerts and urgent notices',
                    columns: 2,
                    fields: ['channel', 'provider', 'isEnabled', 'accountSid', 'authToken', 'fromNumber'],
                  },
                ],
              },
              fields: [
                { name: 'channel', label: 'Channel', type: 'hidden', defaultValue: 'sms' },
                { name: 'provider', label: 'Provider', type: 'hidden', defaultValue: 'twilio' },
                { name: 'isEnabled', label: 'Enable SMS Channel', type: 'switch', defaultValue: smsConfig?.isEnabled ?? false },
                { name: 'accountSid', label: 'Twilio Account SID', type: 'text', placeholder: 'AC••••', defaultValue: smsCfg.accountSid ?? '' },
                { name: 'authToken', label: 'Twilio Auth Token', type: 'password', secret: true, placeholder: smsConfig?.hasSecrets ? '••••••••' : 'Enter auth token' },
                { name: 'fromNumber', label: 'Twilio Sender Phone Number', type: 'text', placeholder: '+1234567890', defaultValue: smsCfg.fromNumber ?? '' },
              ],
            },
          },
        ],
      },
    };
  }

  /**
   * Data Source: In-app notification list for user
   */
  @Get('data/notifications')
  @RequirePermissions('notifications.read')
  async getNotifications(
    @CurrentUser() user: AuthenticatedUser,
    @Query('unreadOnly') unreadOnly?: string,
    @Query('limit') limit?: string,
  ) {
    return this.notificationsService.list(user.tenantId, user.id, {
      unreadOnly: unreadOnly === 'true',
      limit: limit ? parseInt(limit, 10) : 50,
    });
  }

  /**
   * Data Source: Unread count
   */
  @Get('data/notifications/unread-count')
  @RequirePermissions('notifications.read')
  async getUnreadCount(@CurrentUser() user: AuthenticatedUser) {
    const count = await this.notificationsService.countUnread(user.tenantId, user.id);
    return { count };
  }

  /**
   * Data Source: Channel configs for Admin
   */
  @Get('data/notifications/channel-configs')
  @RequirePermissions('notifications.manage')
  async getChannelConfigs(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.getChannelConfigs(user.tenantId);
  }

  /**
   * Action: Mark single notification read
   */
  @Patch('actions/notifications/:id/read')
  @RequirePermissions('notifications.read')
  async markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.notificationsService.markRead(user.tenantId, id, user.id);
  }

  /**
   * Action: Mark single notification unread
   */
  @Patch('actions/notifications/:id/unread')
  @RequirePermissions('notifications.read')
  async markUnread(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.notificationsService.markUnread(user.tenantId, id, user.id);
  }

  /**
   * Action: Mark all notifications read
   */
  @Post('actions/notifications/mark-all-read')
  @RequirePermissions('notifications.read')
  async markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.markAllRead(user.tenantId, user.id);
  }

  /**
   * Action: Delete notification
   */
  @Delete('actions/notifications/:id')
  @RequirePermissions('notifications.read')
  async deleteNotification(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.notificationsService.delete(user.tenantId, id, user.id);
  }

  /**
   * Action: Save Channel Configuration
   */
  @Post('actions/notifications/channel-config')
  @RequirePermissions('notifications.manage')
  async saveChannelConfig(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: Record<string, unknown>,
  ) {
    const channel = String(body.channel ?? '').trim() as any;
    const provider = String(body.provider ?? '').trim();
    const isEnabled = body.isEnabled !== undefined ? Boolean(body.isEnabled) : true;

    if (!channel || !provider) {
      throw new BadRequestException('channel and provider are required');
    }

    const credentials: Record<string, unknown> = {};
    const configuration: Record<string, unknown> = {};

    // Map fields
    for (const [key, val] of Object.entries(body)) {
      if (['channel', 'provider', 'isEnabled'].includes(key)) continue;

      if (['password', 'pass', 'resendApiKey', 'vapidPrivateKey', 'accessToken', 'authToken'].includes(key)) {
        credentials[key] = val;
      } else {
        configuration[key] = val;
      }
    }

    await this.notificationsService.saveChannelConfig(
      user.tenantId,
      channel,
      provider,
      configuration,
      credentials,
      isEnabled,
    );

    return { success: true, message: `${channel} configuration saved successfully` };
  }

  /**
   * Push: Get VAPID Public Key for subscription registration
   */
  @Get('actions/notifications/vapid-public-key')
  @RequirePermissions('notifications.read')
  async getVapidPublicKey(@CurrentUser() user: AuthenticatedUser) {
    const publicKey = await this.notificationsService.getVapidPublicKey(user.tenantId);
    return { publicKey };
  }

  /**
   * Push: Register Push Subscription
   */
  @Post('actions/notifications/push-subscriptions')
  @RequirePermissions('notifications.read')
  async registerPushSubscription(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.notificationsService.registerPushSubscription(user.tenantId, user.id, body as any);
  }

  /**
   * Push: Unregister Push Subscription
   */
  @Delete('actions/notifications/push-subscriptions')
  @RequirePermissions('notifications.read')
  async unregisterPushSubscription(
    @CurrentUser() user: AuthenticatedUser,
    @Body('endpoint') endpoint: string,
  ) {
    return this.notificationsService.removePushSubscription(user.tenantId, endpoint);
  }

  @Post('actions/notifications/push-subscriptions/unregister')
  @RequirePermissions('notifications.read')
  async unregisterPushSubscriptionPost(
    @CurrentUser() user: AuthenticatedUser,
    @Body('endpoint') endpoint: string,
  ) {
    return this.notificationsService.removePushSubscription(user.tenantId, endpoint);
  }

  /**
   * Action: Diagnostic channel test
   */
  @Post('actions/notifications/test')
  @RequirePermissions('notifications.manage')
  async testChannel(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: Record<string, unknown>,
  ) {
    const channel = String(body.channel ?? 'email').trim() as any;
    const provider = String(body.provider ?? '').trim();

    // Map flat form values into configuration & credentials
    const credentials: Record<string, unknown> = {};
    const configuration: Record<string, unknown> = {};

    for (const [key, val] of Object.entries(body)) {
      if (['channel', 'provider', 'isEnabled', 'to'].includes(key)) continue;

      if (['password', 'pass', 'resendApiKey', 'vapidPrivateKey', 'accessToken', 'authToken'].includes(key)) {
        credentials[key] = val;
      } else {
        configuration[key] = val;
      }
    }

    return this.notificationsService.testChannel(user.tenantId, channel, {
      provider: provider || undefined,
      to: typeof body.to === 'string' ? body.to : user.email,
      configuration: Object.keys(configuration).length > 0 ? configuration : undefined,
      credentials: Object.keys(credentials).length > 0 ? credentials : undefined,
    });
  }

  /**
   * Action: Direct API to trigger notification send
   */
  @Post('actions/notifications/send')
  @RequirePermissions('notifications.send')
  async sendNotification(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: any,
  ) {
    let input: NotificationSendInput;
    if (body.recipient && body.message) {
      input = body as NotificationSendInput;
    } else {
      const recipientId = body.recipientUserId || user.id;
      const title = body.title || 'Notification Alert';
      const text = body.body || '';
      const link = body.link;
      input = {
        recipient: { type: 'user', id: recipientId },
        message: {
          title,
          body: text,
        },
        type: body.type || 'informational',
        priority: body.priority || 'normal',
        channels: body.channels || ['in_app', 'push'],
        source: body.source || (body.sourceModule ? { module: body.sourceModule, entity: body.sourceEntity, id: body.sourceId } : undefined),
        actions: body.actions || (link ? [{ id: 'open', label: 'View Record', action: 'open_record', url: link }] : undefined),
      };
    }
    return this.notificationsService.send(input, user.tenantId, user.id);
  }

  /**
   * Action: Trigger realistic sample notification for testing
   */
  @Post('actions/notifications/test-sample')
  @RequirePermissions('notifications.send')
  async testSample(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body?: Record<string, unknown>,
  ) {
    const taskId = String(body?.recordId ?? 'TASK-999');
    const module = String(body?.module ?? 'todo');
    const link = `/app/${module}?record=${taskId}`;

    const res = await this.notificationsService.send(
      {
        recipient: { type: 'user', id: user.id },
        message: {
          title: 'Urgent: Q3 Audit Report needs sign-off',
          body: `Action required: Review task ${taskId} and verify the quarterly compliance requirements before end-of-day.`,
        },
        priority: 'urgent',
        type: 'action_required',
        source: {
          module,
          entity: 'task',
          id: taskId,
        },
        actions: [
          {
            id: 'open-task',
            label: `Review ${taskId}`,
            action: 'open_record',
            url: link,
          },
        ],
        channels: ['in_app', 'push'],
      },
      user.tenantId,
      user.id,
    );

    return {
      success: true,
      message: `Test alert sent to in-app & push notifications with link to ${link}`,
      notification: res.record,
      details: res.deliveryDetails,
    };
  }

  /**
   * Action: Dispatch multi-channel notification from record fields
   */
  @Post('actions/notifications/dispatch')
  @RequirePermissions('notifications.send')
  async dispatchAction(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.dispatchRecordNotification(body, user);
  }

  private async dispatchRecordNotification(body: Record<string, unknown>, user: AuthenticatedUser) {
    const recordId = String(body.id ?? body.recordId ?? '').trim();
    const module = String(body.module ?? body.originModule ?? 'test-notifications').trim();
    const entity = String(body.entity ?? body.originEntity ?? 'alert').trim();

    const title = String(body.title || body.name || `Notification Alert: ${recordId || 'Record'}`).trim();
    const rawBody = body.description ?? body.body ?? body.message;
    const desc = typeof rawBody === 'string' && rawBody.trim() ? rawBody.trim() : `Notification update for ${title}.`;

    const assignedTo = String(body.assigned_to ?? body.recipient_user ?? body.userId ?? '').trim();
    const email = String(body.email ?? body.recipient_email ?? '').trim();
    const phone = String(body.phone ?? body.number ?? body.recipient_phone ?? '').trim();

    const priority = String(body.priority ?? 'normal').toLowerCase() as any;
    const type = String(body.type ?? 'informational').toLowerCase() as any;
    const channel = String(body.channel ?? 'all').toLowerCase();

    const targetUrl = recordId ? `/app/${module}?record=${recordId}` : `/app/${module}`;

    // Map channels
    let channels: any[] = ['in_app'];
    if (channel === 'in_app') channels = ['in_app'];
    else if (channel === 'push') channels = ['push'];
    else if (channel === 'email') channels = ['email'];
    else if (channel === 'whatsapp') channels = ['whatsapp'];
    else if (channel === 'sms') channels = ['sms'];
    else if (channel === 'all') channels = ['in_app', 'push', 'email', 'whatsapp', 'sms'];

    // Determine primary recipient
    let recipient: { type: 'user' | 'email' | 'phone'; id: string };
    if (channel === 'whatsapp' || channel === 'sms') {
      if (phone) {
        recipient = { type: 'phone', id: phone };
      } else if (assignedTo) {
        recipient = { type: 'user', id: assignedTo };
      } else {
        recipient = { type: 'user', id: user.id };
      }
    } else if (channel === 'email') {
      if (email) {
        recipient = { type: 'email', id: email };
      } else if (assignedTo) {
        recipient = { type: 'user', id: assignedTo };
      } else {
        recipient = { type: 'user', id: user.id };
      }
    } else {
      recipient = { type: 'user', id: assignedTo || user.id };
    }

    const input: any = {
      recipient,
      recipientEmail: email || undefined,
      recipientPhone: phone || undefined,
      message: {
        title,
        body: desc,
      },
      type: ['informational', 'action_required', 'warning', 'success', 'error', 'system'].includes(type)
        ? type
        : 'informational',
      priority: ['low', 'normal', 'high', 'urgent'].includes(priority)
        ? priority
        : priority === 'medium'
        ? 'normal'
        : 'normal',
      channels,
      source: {
        module,
        entity,
        id: recordId || undefined,
      },
      actions: [
        {
          id: 'open-record',
          label: `Open ${title.length > 20 ? title.slice(0, 20) + '…' : title}`,
          action: 'open_record',
          url: targetUrl,
        },
      ],
      metadata: {
        originRecordId: recordId,
        recipientEmail: email || undefined,
        recipientPhone: phone || undefined,
        dispatchedBy: user.username,
      },
    };

    const res = await this.notificationsService.send(input, user.tenantId, user.id);

    // Build human-friendly message
    let friendlyMessage = `Notification dispatched successfully`;
    if (channel === 'in_app') {
      friendlyMessage = `In-app alert sent for "${title}"`;
    } else if (channel === 'push') {
      friendlyMessage = `Web push alert sent for "${title}"`;
    } else if (channel === 'email') {
      friendlyMessage = email ? `Email sent to ${email}` : `Email alert dispatched`;
    } else if (channel === 'whatsapp') {
      friendlyMessage = phone ? `WhatsApp message sent to ${phone}` : `WhatsApp message dispatched`;
    } else if (channel === 'sms') {
      friendlyMessage = phone ? `SMS sent to ${phone}` : `SMS dispatched`;
    } else if (channel === 'all') {
      friendlyMessage = `Broadcast sent across channels (In-App, Push, Email, WhatsApp, SMS)`;
    }

    return {
      success: true,
      message: friendlyMessage,
      notification: res.record,
      deliveryDetails: res.deliveryDetails,
    };
  }
}
