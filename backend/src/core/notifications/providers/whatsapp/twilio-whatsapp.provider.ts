import type { WhatsAppProvider, SendWhatsAppOptions, SendResult, TestResult } from '../provider.interface';

export const TwilioWhatsAppProvider: WhatsAppProvider = {
  id: 'twilio_whatsapp',
  name: 'Twilio WhatsApp API',

  async send(options: SendWhatsAppOptions, config: Record<string, unknown>, credentials: Record<string, unknown>): Promise<SendResult> {
    const accountSid = String(config.accountSid ?? '').trim();
    const fromNumber = String(config.fromNumber ?? '').trim();
    const authToken = String(credentials.authToken ?? '').trim();

    if (!accountSid || !authToken || !fromNumber) {
      return { success: false, error: 'Twilio Account SID, Auth Token, and From Number are required' };
    }

    try {
      const from = fromNumber.startsWith('whatsapp:') ? fromNumber : `whatsapp:${fromNumber}`;
      const to = options.to.startsWith('whatsapp:') ? options.to : `whatsapp:${options.to}`;

      const params = new URLSearchParams();
      params.append('From', from);
      params.append('To', to);
      params.append('Body', options.text);

      const basicAuth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      const data = (await res.json()) as any;
      if (!res.ok) {
        return { success: false, error: data.message ?? `Twilio error (${res.status})` };
      }

      return { success: true, messageId: data.sid };
    } catch (err: any) {
      return { success: false, error: err.message ?? 'Failed to send WhatsApp message via Twilio' };
    }
  },

  async test(config: Record<string, unknown>, credentials: Record<string, unknown>): Promise<TestResult> {
    const accountSid = String(config.accountSid ?? '').trim();
    const authToken = String(credentials.authToken ?? '').trim();

    if (!accountSid || !authToken) {
      return { success: false, message: 'Account SID and Auth Token are required' };
    }

    try {
      const basicAuth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`, {
        headers: { Authorization: `Basic ${basicAuth}` },
      });
      const data = (await res.json()) as any;
      if (!res.ok) {
        return { success: false, message: `Twilio auth failed: ${data.message ?? res.status}` };
      }
      return {
        success: true,
        message: `Twilio account verified: ${data.friendly_name || accountSid} (${data.status})`,
      };
    } catch (err: any) {
      return { success: false, message: `Twilio connection failed: ${err.message}` };
    }
  },
};
