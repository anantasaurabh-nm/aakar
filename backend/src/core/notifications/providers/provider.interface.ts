export type NotificationChannelId = 'in_app' | 'email' | 'push' | 'whatsapp' | 'sms';

export interface SendEmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  fromEmail?: string;
  fromName?: string;
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  details?: Record<string, unknown>;
}

export interface TestResult {
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
}

export interface EmailProvider {
  id: string;
  name: string;
  send(options: SendEmailOptions, config: Record<string, unknown>, credentials: Record<string, unknown>): Promise<SendResult>;
  test(config: Record<string, unknown>, credentials: Record<string, unknown>): Promise<TestResult>;
}

export interface PushSubscriptionTarget {
  id?: string;
  endpoint: string;
  p256dhKey: string;
  authKey: string;
}

export interface PushProvider {
  id: string;
  name: string;
  send(
    subscription: PushSubscriptionTarget,
    payload: Record<string, unknown>,
    config: Record<string, unknown>,
    credentials: Record<string, unknown>,
  ): Promise<SendResult & { expired?: boolean }>;
  generateVapidKeys(): { publicKey: string; privateKey: string };
  test(config: Record<string, unknown>, credentials: Record<string, unknown>): Promise<TestResult>;
}

export interface SendWhatsAppOptions {
  to: string;
  text: string;
  template?: string;
  parameters?: Record<string, unknown>;
}

export interface WhatsAppProvider {
  id: string;
  name: string;
  send(options: SendWhatsAppOptions, config: Record<string, unknown>, credentials: Record<string, unknown>): Promise<SendResult>;
  test(config: Record<string, unknown>, credentials: Record<string, unknown>): Promise<TestResult>;
}

export interface SendSmsOptions {
  to: string;
  message: string;
}

export interface SmsProvider {
  id: string;
  name: string;
  send(options: SendSmsOptions, config: Record<string, unknown>, credentials: Record<string, unknown>): Promise<SendResult>;
  test(config: Record<string, unknown>, credentials: Record<string, unknown>): Promise<TestResult>;
}
