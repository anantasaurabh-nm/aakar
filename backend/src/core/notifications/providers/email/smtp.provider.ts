import * as nodemailer from 'nodemailer';
import type { EmailProvider, SendEmailOptions, SendResult, TestResult } from '../provider.interface';

export const SmtpEmailProvider: EmailProvider = {
  id: 'smtp',
  name: 'SMTP Server',

  async send(options: SendEmailOptions, config: Record<string, unknown>, credentials: Record<string, unknown>): Promise<SendResult> {
    const host = String(config.host ?? '').trim();
    const port = Number(config.port ?? 587);
    const secure = Boolean(config.secure ?? (port === 465));
    const user = String(credentials.user ?? config.user ?? '').trim();
    const pass = String(credentials.pass ?? credentials.password ?? '').trim();
    const fromEmail = String(options.fromEmail ?? config.fromEmail ?? user);
    const fromName = String(options.fromName ?? config.fromName ?? 'DoersOS');

    if (!host) {
      return { success: false, error: 'SMTP host is not configured' };
    }

    try {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: user ? { user, pass } : undefined,
        tls: { rejectUnauthorized: false },
      });

      const info = await transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html ?? (options.text ? `<p>${options.text.replace(/\n/g, '<br/>')}</p>` : undefined),
      });

      return {
        success: true,
        messageId: info.messageId,
        details: { response: info.response },
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message ?? 'Failed to send email via SMTP',
      };
    }
  },

  async test(config: Record<string, unknown>, credentials: Record<string, unknown>): Promise<TestResult> {
    const host = String(config.host ?? '').trim();
    const port = Number(config.port ?? 587);
    const secure = Boolean(config.secure ?? (port === 465));
    const user = String(credentials.user ?? config.user ?? '').trim();
    const pass = String(credentials.pass ?? credentials.password ?? '').trim();

    if (!host) {
      return { success: false, message: 'SMTP host is required' };
    }

    try {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: user ? { user, pass } : undefined,
        tls: { rejectUnauthorized: false },
      });

      await transporter.verify();
      return { success: true, message: `SMTP connection to ${host}:${port} verified successfully!` };
    } catch (err: any) {
      return { success: false, message: `SMTP connection failed: ${err.message}` };
    }
  },
};
