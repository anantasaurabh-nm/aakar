export type NotificationType =
  | 'informational'
  | 'action_required'
  | 'warning'
  | 'success'
  | 'error'
  | 'system';

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export type NotificationChannel = 'in_app' | 'email' | 'push' | 'whatsapp' | 'sms';

export type NotificationDeliveryStatus =
  | 'requested'
  | 'queued'
  | 'processing'
  | 'delivered'
  | 'failed'
  | 'cancelled';

export interface NotificationSource {
  module: string;
  entity?: string;
  id?: string;
}

export interface NotificationAction {
  id: string;
  label: string;
  action?: string;
  url?: string;
  variant?: 'primary' | 'secondary' | 'danger';
}

export interface NotificationRecipient {
  type: 'user' | 'email' | 'phone';
  id: string;
}

export interface NotificationMessage {
  title: string;
  body: string;
  template?: string;
  data?: Record<string, unknown>;
}

export interface NotificationSendInput {
  recipient: NotificationRecipient;
  message: NotificationMessage;
  type?: NotificationType;
  priority?: NotificationPriority;
  channels?: NotificationChannel[];
  source?: NotificationSource;
  actions?: NotificationAction[];
  idempotency_key?: string;
  metadata?: Record<string, unknown>;
}

export interface NotificationRecord {
  id: string;
  tenantId: string;
  recipientId: string;
  title: string;
  body: string;
  type: NotificationType;
  priority: NotificationPriority;
  status: NotificationDeliveryStatus;
  channels: NotificationChannel[];
  sourceModule?: string | null;
  sourceEntity?: string | null;
  sourceId?: string | null;
  actions?: NotificationAction[] | null;
  readAt?: string | null;
  expiresAt?: string | null;
  idempotencyKey?: string | null;
  metadata?: Record<string, unknown> | null;
  deliveryDetails?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface PushSubscriptionInput {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userAgent?: string;
}

export interface NotificationChannelConfigDto {
  id: string;
  channel: NotificationChannel;
  provider: string;
  isEnabled: boolean;
  isDefault: boolean;
  configuration?: Record<string, unknown>;
  hasSecrets?: boolean;
  lastTestedAt?: string | null;
  lastTestedStatus?: string | null;
  createdAt: string;
  updatedAt: string;
}
