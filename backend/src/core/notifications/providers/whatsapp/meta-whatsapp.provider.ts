import type { WhatsAppProvider, SendWhatsAppOptions, SendResult, TestResult } from '../provider.interface';

export const MetaWhatsAppProvider: WhatsAppProvider = {
  id: 'meta_whatsapp',
  name: 'Meta WhatsApp Cloud API',

  async send(options: SendWhatsAppOptions, config: Record<string, unknown>, credentials: Record<string, unknown>): Promise<SendResult> {
    const phoneNumberId = String(config.phoneNumberId ?? '').trim();
    const accessToken = String(credentials.accessToken ?? credentials.token ?? '').trim();

    if (!phoneNumberId || !accessToken) {
      return { success: false, error: 'Meta WhatsApp Phone Number ID or Access Token is missing' };
    }

    try {
      const cleanTo = options.to.replace(/\D/g, '');
      const res = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: cleanTo,
          type: 'text',
          text: {
            preview_url: false,
            body: options.text,
          },
        }),
      });

      const data = (await res.json()) as any;
      if (!res.ok) {
        return {
          success: false,
          error: data.error?.message ?? `WhatsApp Cloud API error (${res.status})`,
        };
      }

      return {
        success: true,
        messageId: data.messages?.[0]?.id,
        details: data,
      };
    } catch (err: any) {
      return { success: false, error: err.message ?? 'Failed to send WhatsApp message via Meta Cloud API' };
    }
  },

  async test(config: Record<string, unknown>, credentials: Record<string, unknown>): Promise<TestResult> {
    const phoneNumberId = String(config.phoneNumberId ?? '').trim();
    const accessToken = String(credentials.accessToken ?? credentials.token ?? '').trim();

    if (!phoneNumberId || !accessToken) {
      return { success: false, message: 'Phone Number ID and Access Token are required' };
    }

    try {
      const res = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = (await res.json()) as any;
      if (!res.ok) {
        return { success: false, message: `Meta verification failed: ${data.error?.message ?? res.status}` };
      }
      return {
        success: true,
        message: `Verified WhatsApp phone number: ${data.display_phone_number || phoneNumberId} (${data.verified_name || 'Active'})`,
      };
    } catch (err: any) {
      return { success: false, message: `Meta WhatsApp connection failed: ${err.message}` };
    }
  },
};
