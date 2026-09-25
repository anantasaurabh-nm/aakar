import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { NotificationProviderRegistry } from './providers/provider.registry';
import type {
  NotificationSendInput,
  NotificationChannel,
  NotificationRecord,
  PushSubscriptionInput,
  NotificationChannelConfigDto,
} from '@erp/shared-contracts';

export interface SendNotificationResult {
  success: boolean;
  notificationId?: string;
  record?: any;
  deliveryDetails: Record<string, unknown>;
  error?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly providerRegistry: NotificationProviderRegistry,
  ) {}

  /**
   * Helper to mask secret values for client preview (e.g. "••••••••" or "sk_••••3a9f").
   */
  maskSecret(secret?: string): string {
    if (!secret || typeof secret !== 'string') return '••••••••';
    const trimmed = secret.trim();
    if (trimmed.length <= 8) return '••••••••';
    const prefix = trimmed.slice(0, 3);
    const suffix = trimmed.slice(-4);
    return `${prefix}••••••••${suffix}`;
  }

  /**
   * Primary method to send a notification through configured channels.
   */
  async send(
    input: NotificationSendInput,
    tenantId: string,
    currentUserId?: string,
  ): Promise<SendNotificationResult> {
    if (!tenantId) {
      throw new BadRequestException('tenantId is required to send notifications');
    }
    if (!input.recipient || !input.recipient.id) {
      throw new BadRequestException('Notification recipient is required');
    }
    if (!input.message || !input.message.title) {
      throw new BadRequestException('Notification title is required');
    }

    const idempotencyKey = input.idempotency_key ? String(input.idempotency_key).trim() : null;

    // Idempotency check: if already sent with this key for this tenant, return existing
    if (idempotencyKey) {
      const existing = await this.prisma.notification.findUnique({
        where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } },
      });
      if (existing) {
        this.logger.log(`Idempotent notification hit for key: ${idempotencyKey}`);
        return {
          success: true,
          notificationId: existing.id,
          record: existing,
          deliveryDetails: (existing.deliveryDetails as Record<string, unknown>) ?? { duplicate: true },
        };
      }
    }

    // Resolve recipient details
    let recipientId = input.recipient.id;
    let recipientEmail: string | undefined =
      (input as any).recipientEmail || (input.metadata?.recipientEmail as string | undefined);
    let recipientPhone: string | undefined =
      (input as any).recipientPhone || (input.metadata?.recipientPhone as string | undefined);

    if (input.recipient.type === 'user') {
      const user = await this.prisma.user.findUnique({
        where: { id: recipientId },
        select: { id: true, email: true },
      });
      if (user && !recipientEmail) {
        recipientEmail = user.email;
      }
    } else if (input.recipient.type === 'email') {
      recipientEmail = input.recipient.id;
      // Find matching user if any
      const user = await this.prisma.user.findFirst({
        where: { tenantId, email: recipientEmail },
        select: { id: true },
      });
      if (user) {
        recipientId = user.id;
      } else if (currentUserId) {
        recipientId = currentUserId;
      }
    } else if (input.recipient.type === 'phone') {
      recipientPhone = input.recipient.id;
      if (currentUserId) {
        recipientId = currentUserId;
      }
    }

    const requestedChannels: NotificationChannel[] =
      input.channels && input.channels.length > 0 ? input.channels : ['in_app'];

    const deliveryDetails: Record<string, unknown> = {};

    // 1. Channel: In-App (always supported and created first)
    let inAppStatus = 'skipped';
    if (requestedChannels.includes('in_app')) {
      inAppStatus = 'delivered';
      deliveryDetails.in_app = { status: 'delivered', recipientId };
    }

    // Create the persistent notification record
    const notification = await this.prisma.notification.create({
      data: {
        tenantId,
        recipientId,
        title: input.message.title,
        body: input.message.body,
        type: input.type ?? 'informational',
        priority: input.priority ?? 'normal',
        status: inAppStatus === 'delivered' ? 'delivered' : 'queued',
        channels: requestedChannels,
        sourceModule: input.source?.module ?? null,
        sourceEntity: input.source?.entity ?? null,
        sourceId: input.source?.id ?? null,
        actions: (input.actions as any) ?? undefined,
        idempotencyKey,
        metadata: (input.metadata as any) ?? undefined,
        deliveryDetails: undefined, // will update below
      },
    });

    // 2. Channel: Email
    if (requestedChannels.includes('email')) {
      if (!recipientEmail) {
        deliveryDetails.email = { status: 'failed', error: 'No recipient email address available' };
      } else {
        const emailConfig = await this.prisma.notificationChannelConfig.findFirst({
          where: { tenantId, channel: 'email', isEnabled: true },
        });

        if (!emailConfig) {
          deliveryDetails.email = { status: 'skipped', reason: 'Email channel not configured or disabled' };
        } else {
          try {
            const credentials = emailConfig.encryptedCredentials
              ? JSON.parse(this.crypto.decrypt(emailConfig.encryptedCredentials))
              : {};
            const config = (emailConfig.configuration as Record<string, unknown>) ?? {};
            const provider = this.providerRegistry.getEmail(emailConfig.provider);

            if (!provider) {
              deliveryDetails.email = { status: 'failed', error: `Unknown email provider: ${emailConfig.provider}` };
            } else {
              const res = await provider.send(
                {
                  to: recipientEmail,
                  subject: input.message.title,
                  text: input.message.body,
                  fromEmail: config.fromEmail as string | undefined,
                  fromName: config.fromName as string | undefined,
                },
                config,
                credentials,
              );
              deliveryDetails.email = {
                status: res.success ? 'delivered' : 'failed',
                provider: emailConfig.provider,
                messageId: res.messageId,
                error: res.error,
              };
            }
          } catch (err: any) {
            deliveryDetails.email = { status: 'failed', error: err.message };
          }
        }
      }
    }

    // 3. Channel: Web Push
    if (requestedChannels.includes('push')) {
      const pushConfig = await this.prisma.notificationChannelConfig.findFirst({
        where: { tenantId, channel: 'push', isEnabled: true },
      });

      if (!pushConfig) {
        deliveryDetails.push = { status: 'skipped', reason: 'Web Push channel not configured or disabled' };
      } else {
        const subscriptions = await this.prisma.pushSubscription.findMany({
          where: { tenantId, userId: recipientId, status: 'active' },
        });

        if (subscriptions.length === 0) {
          deliveryDetails.push = { status: 'skipped', reason: 'No active push subscriptions found for recipient' };
        } else {
          try {
            const credentials = pushConfig.encryptedCredentials
              ? JSON.parse(this.crypto.decrypt(pushConfig.encryptedCredentials))
              : {};
            const config = (pushConfig.configuration as Record<string, unknown>) ?? {};
            const provider = this.providerRegistry.getPush(pushConfig.provider);

            if (!provider) {
              deliveryDetails.push = { status: 'failed', error: `Unknown push provider: ${pushConfig.provider}` };
            } else {
              let sentCount = 0;
              let expiredCount = 0;
              let failedCount = 0;

              const pushPayload = {
                notification_id: notification.id,
                title: input.message.title,
                body: input.message.body,
                type: input.type ?? 'informational',
                source: input.source,
                actions: input.actions,
                data: {
                  url:
                    input.actions?.[0]?.url ??
                    (input.source?.module
                      ? `/app/${input.source.module}${input.source.id ? `?record=${input.source.id}` : ''}`
                      : '/'),
                  source: input.source,
                },
              };

              for (const sub of subscriptions) {
                const res = await provider.send(
                  {
                    id: sub.id,
                    endpoint: sub.endpoint,
                    p256dhKey: sub.p256dhKey,
                    authKey: sub.authKey,
                  },
                  pushPayload,
                  config,
                  credentials,
                );

                if (res.success) {
                  sentCount++;
                } else if (res.expired) {
                  expiredCount++;
                  // Mark expired subscription
                  await this.prisma.pushSubscription.update({
                    where: { id: sub.id },
                    data: { status: 'expired' },
                  });
                } else {
                  failedCount++;
                }
              }

              deliveryDetails.push = {
                status: sentCount > 0 ? 'delivered' : failedCount > 0 ? 'failed' : 'skipped',
                sentCount,
                expiredCount,
                failedCount,
                totalSubscriptions: subscriptions.length,
              };
            }
          } catch (err: any) {
            deliveryDetails.push = { status: 'failed', error: err.message };
          }
        }
      }
    }

    // 4. Channel: WhatsApp
    if (requestedChannels.includes('whatsapp')) {
      if (!recipientPhone) {
        deliveryDetails.whatsapp = { status: 'failed', error: 'No recipient phone number available' };
      } else {
        const waConfig = await this.prisma.notificationChannelConfig.findFirst({
          where: { tenantId, channel: 'whatsapp', isEnabled: true },
        });
        if (!waConfig) {
          deliveryDetails.whatsapp = { status: 'skipped', reason: 'WhatsApp channel not configured or disabled' };
        } else {
          try {
            const credentials = waConfig.encryptedCredentials
              ? JSON.parse(this.crypto.decrypt(waConfig.encryptedCredentials))
              : {};
            const config = (waConfig.configuration as Record<string, unknown>) ?? {};
            const provider = this.providerRegistry.getWhatsApp(waConfig.provider);

            if (!provider) {
              deliveryDetails.whatsapp = { status: 'failed', error: `Unknown WhatsApp provider: ${waConfig.provider}` };
            } else {
              const res = await provider.send(
                {
                  to: recipientPhone,
                  text: `${input.message.title}\n${input.message.body}`,
                },
                config,
                credentials,
              );
              deliveryDetails.whatsapp = {
                status: res.success ? 'delivered' : 'failed',
                provider: waConfig.provider,
                messageId: res.messageId,
                error: res.error,
              };
            }
          } catch (err: any) {
            deliveryDetails.whatsapp = { status: 'failed', error: err.message };
          }
        }
      }
    }

    // 5. Channel: SMS
    if (requestedChannels.includes('sms')) {
      if (!recipientPhone) {
        deliveryDetails.sms = { status: 'failed', error: 'No recipient phone number available' };
      } else {
        const smsConfig = await this.prisma.notificationChannelConfig.findFirst({
          where: { tenantId, channel: 'sms', isEnabled: true },
        });
        if (!smsConfig) {
          deliveryDetails.sms = { status: 'skipped', reason: 'SMS channel not configured or disabled' };
        } else {
          try {
            const credentials = smsConfig.encryptedCredentials
              ? JSON.parse(this.crypto.decrypt(smsConfig.encryptedCredentials))
              : {};
            const config = (smsConfig.configuration as Record<string, unknown>) ?? {};
            const provider = this.providerRegistry.getSms(smsConfig.provider);

            if (!provider) {
              deliveryDetails.sms = { status: 'failed', error: `Unknown SMS provider: ${smsConfig.provider}` };
            } else {
              const res = await provider.send(
                {
                  to: recipientPhone,
                  message: `${input.message.title}: ${input.message.body}`,
                },
                config,
                credentials,
              );
              deliveryDetails.sms = {
                status: res.success ? 'delivered' : 'failed',
                provider: smsConfig.provider,
                messageId: res.messageId,
                error: res.error,
              };
            }
          } catch (err: any) {
            deliveryDetails.sms = { status: 'failed', error: err.message };
          }
        }
      }
    }

    // Update notification with final delivery details
    const updated = await this.prisma.notification.update({
      where: { id: notification.id },
      data: { deliveryDetails: deliveryDetails as any },
    });

    return {
      success: true,
      notificationId: updated.id,
      record: updated,
      deliveryDetails,
    };
  }

  /**
   * Batch sending with individual error containment.
   */
  async sendBatch(
    inputs: NotificationSendInput[],
    tenantId: string,
    currentUserId?: string,
  ) {
    const results: SendNotificationResult[] = [];
    for (const input of inputs) {
      try {
        const res = await this.send(input, tenantId, currentUserId);
        results.push(res);
      } catch (err: any) {
        results.push({
          success: false,
          error: err.message,
          deliveryDetails: { error: err.message },
        });
      }
    }
    return {
      total: inputs.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    };
  }

  /**
   * List in-app notifications for a user or tenant.
   */
  async list(
    tenantId: string,
    recipientId?: string,
    options: { unreadOnly?: boolean; limit?: number; offset?: number } = {},
  ) {
    const where: any = { tenantId };
    if (recipientId) {
      where.recipientId = recipientId;
    }
    if (options.unreadOnly) {
      where.readAt = null;
    }

    const [items, total, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: options.limit ?? 50,
        skip: options.offset ?? 0,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({
        where: { ...where, readAt: null },
      }),
    ]);

    return {
      items,
      total,
      unread,
    };
  }

  /**
   * Get total unread count for a user.
   */
  async countUnread(tenantId: string, recipientId: string): Promise<number> {
    return this.prisma.notification.count({
      where: {
        tenantId,
        recipientId,
        readAt: null,
      },
    });
  }

  /**
   * Mark a notification as read.
   */
  async markRead(tenantId: string, id: string, recipientId?: string) {
    const where: any = { id, tenantId };
    if (recipientId) where.recipientId = recipientId;

    const notif = await this.prisma.notification.findFirst({ where });
    if (!notif) throw new NotFoundException(`Notification ${id} not found`);

    return this.prisma.notification.update({
      where: { id: notif.id },
      data: { readAt: new Date() },
    });
  }

  /**
   * Mark a notification as unread.
   */
  async markUnread(tenantId: string, id: string, recipientId?: string) {
    const where: any = { id, tenantId };
    if (recipientId) where.recipientId = recipientId;

    const notif = await this.prisma.notification.findFirst({ where });
    if (!notif) throw new NotFoundException(`Notification ${id} not found`);

    return this.prisma.notification.update({
      where: { id: notif.id },
      data: { readAt: null },
    });
  }

  /**
   * Mark all notifications as read for a user.
   */
  async markAllRead(tenantId: string, recipientId: string) {
    return this.prisma.notification.updateMany({
      where: {
        tenantId,
        recipientId,
        readAt: null,
      },
      data: { readAt: new Date() },
    });
  }

  /**
   * Delete a notification.
   */
  async delete(tenantId: string, id: string, recipientId?: string) {
    const where: any = { id, tenantId };
    if (recipientId) where.recipientId = recipientId;

    const notif = await this.prisma.notification.findFirst({ where });
    if (!notif) throw new NotFoundException(`Notification ${id} not found`);

    await this.prisma.notification.delete({ where: { id: notif.id } });
    return { success: true, message: 'Notification deleted' };
  }

  /**
   * Register a PWA browser push subscription.
   */
  async registerPushSubscription(
    tenantId: string,
    userId: string,
    input: PushSubscriptionInput,
  ) {
    if (!input.endpoint || !input.keys || !input.keys.p256dh || !input.keys.auth) {
      throw new BadRequestException('Valid push subscription endpoint and keys are required');
    }

    return this.prisma.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      update: {
        tenantId,
        userId,
        p256dhKey: input.keys.p256dh,
        authKey: input.keys.auth,
        userAgent: input.userAgent ?? null,
        status: 'active',
      },
      create: {
        tenantId,
        userId,
        endpoint: input.endpoint,
        p256dhKey: input.keys.p256dh,
        authKey: input.keys.auth,
        userAgent: input.userAgent ?? null,
        status: 'active',
      },
    });
  }

  /**
   * Remove / revoke a push subscription.
   */
  async removePushSubscription(tenantId: string, endpoint: string) {
    return this.prisma.pushSubscription.updateMany({
      where: { tenantId, endpoint },
      data: { status: 'revoked' },
    });
  }

  /**
   * Get or initialize VAPID public key for browser push subscription.
   */
  async getVapidPublicKey(tenantId: string): Promise<string> {
    const existing = await this.prisma.notificationChannelConfig.findFirst({
      where: { tenantId, channel: 'push' },
    });

    const config = (existing?.configuration as Record<string, unknown>) ?? {};
    if (config.vapidPublicKey) {
      return String(config.vapidPublicKey);
    }

    // Automatically generate new VAPID keys if none configured
    const keys = this.providerRegistry.getPush()?.generateVapidKeys();
    if (!keys) {
      throw new Error('Web Push provider unavailable');
    }

    const encryptedCredentials = this.crypto.encrypt(
      JSON.stringify({ vapidPrivateKey: keys.privateKey }),
    );

    await this.prisma.notificationChannelConfig.upsert({
      where: {
        tenantId_channel_provider: {
          tenantId,
          channel: 'push',
          provider: 'webpush',
        },
      },
      update: {
        configuration: {
          vapidPublicKey: keys.publicKey,
          vapidSubject: 'mailto:notifications@doers-os.internal',
        },
        encryptedCredentials,
        isEnabled: true,
      },
      create: {
        tenantId,
        channel: 'push',
        provider: 'webpush',
        configuration: {
          vapidPublicKey: keys.publicKey,
          vapidSubject: 'mailto:notifications@doers-os.internal',
        },
        encryptedCredentials,
        isEnabled: true,
      },
    });

    return keys.publicKey;
  }

  /**
   * List all channel configurations for a tenant with safe masked credentials.
   */
  async getChannelConfigs(tenantId: string): Promise<NotificationChannelConfigDto[]> {
    const configs = await this.prisma.notificationChannelConfig.findMany({
      where: { tenantId },
      orderBy: { channel: 'asc' },
    });

    return configs.map((c) => {
      const configuration = (c.configuration as Record<string, unknown>) ?? {};
      return {
        id: c.id,
        channel: c.channel as any,
        provider: c.provider,
        isEnabled: c.isEnabled,
        isDefault: c.isDefault,
        configuration,
        hasSecrets: Boolean(c.encryptedCredentials),
        lastTestedAt: c.lastTestedAt?.toISOString() ?? null,
        lastTestedStatus: c.lastTestedStatus ?? null,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      };
    });
  }

  /**
   * Save or update a channel configuration.
   */
  async saveChannelConfig(
    tenantId: string,
    channel: NotificationChannel,
    provider: string,
    configuration: Record<string, unknown>,
    credentials?: Record<string, unknown>,
    isEnabled: boolean = true,
  ) {
    let encryptedCredentials: string | undefined;

    // If new credentials supplied, encrypt them; otherwise preserve existing
    if (credentials && Object.keys(credentials).length > 0) {
      const existing = await this.prisma.notificationChannelConfig.findUnique({
        where: {
          tenantId_channel_provider: {
            tenantId,
            channel,
            provider,
          },
        },
      });

      let mergedCreds: Record<string, unknown> = {};
      if (existing?.encryptedCredentials) {
        try {
          mergedCreds = JSON.parse(this.crypto.decrypt(existing.encryptedCredentials));
        } catch {
          mergedCreds = {};
        }
      }

      for (const [k, v] of Object.entries(credentials)) {
        if (typeof v === 'string' && (v.trim() === '' || v.includes('•'))) {
          continue; // keep existing value
        }
        mergedCreds[k] = v;
      }

      encryptedCredentials = this.crypto.encrypt(JSON.stringify(mergedCreds));
    }

    return this.prisma.notificationChannelConfig.upsert({
      where: {
        tenantId_channel_provider: {
          tenantId,
          channel,
          provider,
        },
      },
      update: {
        configuration: configuration as any,
        isEnabled,
        ...(encryptedCredentials ? { encryptedCredentials } : {}),
      },
      create: {
        tenantId,
        channel,
        provider,
        configuration: configuration as any,
        encryptedCredentials: encryptedCredentials ?? this.crypto.encrypt('{}'),
        isEnabled,
      },
    });
  }

  /**
   * Diagnostic test execution for any channel.
   */
  async testChannel(
    tenantId: string,
    channel: NotificationChannel,
    testInput: {
      provider?: string;
      to?: string;
      configuration?: Record<string, unknown>;
      credentials?: Record<string, unknown>;
    },
  ) {
    const providerId = testInput.provider ?? (channel === 'push' ? 'webpush' : channel === 'email' ? 'smtp' : 'meta_whatsapp');

    // Merge in-flight config/credentials with stored DB configuration
    const stored = await this.prisma.notificationChannelConfig.findUnique({
      where: {
        tenantId_channel_provider: {
          tenantId,
          channel,
          provider: providerId,
        },
      },
    });

    let storedCredentials: Record<string, unknown> = {};
    if (stored?.encryptedCredentials) {
      try {
        storedCredentials = JSON.parse(this.crypto.decrypt(stored.encryptedCredentials));
      } catch {
        storedCredentials = {};
      }
    }

    const mergedCredentials: Record<string, unknown> = {
      ...storedCredentials,
      ...(testInput.credentials ?? {}),
    };

    const mergedConfig: Record<string, unknown> = {
      ...((stored?.configuration as Record<string, unknown>) ?? {}),
      ...(testInput.configuration ?? {}),
    };

    let result: { success: boolean; message: string };

    if (channel === 'email') {
      const provider = this.providerRegistry.getEmail(providerId);
      if (!provider) return { success: false, message: `Unknown email provider: ${providerId}` };
      result = await provider.test(mergedConfig, mergedCredentials);

      // If a destination email was specified and test passed, attempt a live test send!
      if (result.success && testInput.to) {
        const sendRes = await provider.send(
          {
            to: testInput.to,
            subject: 'DoersOS Test Notification',
            text: 'This is a test notification confirming your email channel configuration is active and working!',
          },
          mergedConfig,
          mergedCredentials,
        );
        if (!sendRes.success) {
          result = { success: false, message: `Connection OK, but test email send failed: ${sendRes.error}` };
        } else {
          result.message += ` Test email delivered to ${testInput.to}!`;
        }
      }
    } else if (channel === 'push') {
      const provider = this.providerRegistry.getPush(providerId);
      if (!provider) return { success: false, message: `Unknown push provider: ${providerId}` };
      result = await provider.test(mergedConfig, mergedCredentials);
      if (result.success) {
        const subs = await this.prisma.pushSubscription.findMany({
          where: { tenantId, status: 'active' },
          take: 5,
        });
        if (subs.length > 0) {
          for (const s of subs) {
            await provider.send(
              {
                id: s.id,
                endpoint: s.endpoint,
                p256dhKey: s.p256dhKey,
                authKey: s.authKey,
              },
              {
                title: 'DoersOS Web Push Test',
                body: 'Push notification parameters verified successfully!',
                icon: '/favicon.ico',
              },
              mergedConfig,
              mergedCredentials,
            );
          }
          result.message += ` (Push sent to ${subs.length} active device${subs.length > 1 ? 's' : ''})`;
        }
      }
    } else if (channel === 'whatsapp') {
      const provider = this.providerRegistry.getWhatsApp(providerId);
      if (!provider) return { success: false, message: `Unknown WhatsApp provider: ${providerId}` };
      result = await provider.test(mergedConfig, mergedCredentials);
    } else if (channel === 'sms') {
      const provider = this.providerRegistry.getSms(providerId);
      if (!provider) return { success: false, message: `Unknown SMS provider: ${providerId}` };
      result = await provider.test(mergedConfig, mergedCredentials);
    } else {
      result = { success: true, message: 'In-app channel is native and always active' };
    }

    // Record diagnostic status on channel config if stored record exists
    if (stored) {
      await this.prisma.notificationChannelConfig.update({
        where: { id: stored.id },
        data: {
          lastTestedAt: new Date(),
          lastTestedStatus: result.success ? 'ok' : result.message,
        },
      });
    }

    return result;
  }
}
