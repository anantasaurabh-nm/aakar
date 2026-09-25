import type { EmailProvider, SendEmailOptions, SendResult, TestResult } from '../provider.interface';

export const ResendEmailProvider: EmailProvider = {
  id: 'resend',
  name: 'Resend',

  async send(options: SendEmailOptions, config: Record<string, unknown>, credentials: Record<string, unknown>): Promise<SendResult> {
    const apiKey = String(credentials.apiKey ?? '').trim();
    const fromEmail = String(options.fromEmail ?? config.fromEmail ?? 'notifications@doers-os.internal');
    const fromName = String(options.fromName ?? config.fromName ?? 'DoersOS');

    if (!apiKey) {
      return { success: false, error: 'Resend API key is not configured' };
    }

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `${fromName} <${fromEmail}>`,
          to: [options.to],
          subject: options.subject,
          text: options.text,
          html: options.html ?? (options.text ? `<p>${options.text.replace(/\n/g, '<br/>')}</p>` : undefined),
        }),
      });

      const data = (await res.json()) as any;
      if (!res.ok) {
        return { success: false, error: data.message ?? `Resend error (${res.status})` };
      }

      return { success: true, messageId: data.id };
    } catch (err: any) {
      return { success: false, error: err.message ?? 'Failed to send email via Resend' };
    }
  },

  async test(config: Record<string, unknown>, credentials: Record<string, unknown>): Promise<TestResult> {
    const apiKey = String(credentials.apiKey ?? '').trim();
    if (!apiKey) {
      return { success: false, message: 'Resend API key is required' };
    }

    try {
      const res = await fetch('https://api.resend.com/api-keys', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) {
        return { success: false, message: `Resend API authentication failed (${res.status})` };
      }
      return { success: true, message: 'Resend API connection verified successfully!' };
    } catch (err: any) {
      return { success: false, message: `Resend connection failed: ${err.message}` };
    }
  },
};
