import { Resend } from 'resend';
import type { EmailMessage, EmailSender } from './types';

const DEFAULT_FROM = 'onboarding@resend.dev';

export class ResendEmailSender implements EmailSender {
  private client: Resend;
  private from: string;

  constructor(apiKey: string, from: string = process.env.EMAIL_FROM || DEFAULT_FROM) {
    this.client = new Resend(apiKey);
    this.from = from;
  }

  async send(message: EmailMessage): Promise<void> {
    const result = await this.client.emails.send({
      from: this.from,
      to: message.to,
      subject: message.subject,
      react: message.react,
    });

    if (result.error) {
      throw new Error(`Resend error: ${result.error.message}`);
    }
  }
}
