import { Injectable } from '@nestjs/common';
import type {
  EmailProvider,
  PushProvider,
  WhatsAppProvider,
  SmsProvider,
} from './provider.interface';
import { SmtpEmailProvider } from './email/smtp.provider';
import { ResendEmailProvider } from './email/resend.provider';
import { WebPushProvider } from './push/webpush.provider';
import { MetaWhatsAppProvider } from './whatsapp/meta-whatsapp.provider';
import { TwilioWhatsAppProvider } from './whatsapp/twilio-whatsapp.provider';
import { TwilioSmsProvider } from './sms/twilio-sms.provider';

@Injectable()
export class NotificationProviderRegistry {
  private readonly emailProviders = new Map<string, EmailProvider>();
  private readonly pushProviders = new Map<string, PushProvider>();
  private readonly whatsappProviders = new Map<string, WhatsAppProvider>();
  private readonly smsProviders = new Map<string, SmsProvider>();

  constructor() {
    this.registerEmail(SmtpEmailProvider);
    this.registerEmail(ResendEmailProvider);

    this.registerPush(WebPushProvider);

    this.registerWhatsApp(MetaWhatsAppProvider);
    this.registerWhatsApp(TwilioWhatsAppProvider);

    this.registerSms(TwilioSmsProvider);
  }

  registerEmail(provider: EmailProvider): void {
    this.emailProviders.set(provider.id, provider);
  }

  getEmail(id: string): EmailProvider | undefined {
    return this.emailProviders.get(id);
  }

  getAllEmail(): EmailProvider[] {
    return Array.from(this.emailProviders.values());
  }

  registerPush(provider: PushProvider): void {
    this.pushProviders.set(provider.id, provider);
  }

  getPush(id: string = 'webpush'): PushProvider | undefined {
    return this.pushProviders.get(id);
  }

  registerWhatsApp(provider: WhatsAppProvider): void {
    this.whatsappProviders.set(provider.id, provider);
  }

  getWhatsApp(id: string): WhatsAppProvider | undefined {
    return this.whatsappProviders.get(id);
  }

  getAllWhatsApp(): WhatsAppProvider[] {
    return Array.from(this.whatsappProviders.values());
  }

  registerSms(provider: SmsProvider): void {
    this.smsProviders.set(provider.id, provider);
  }

  getSms(id: string): SmsProvider | undefined {
    return this.smsProviders.get(id);
  }

  getAllSms(): SmsProvider[] {
    return Array.from(this.smsProviders.values());
  }
}
