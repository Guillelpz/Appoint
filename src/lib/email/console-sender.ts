import { render } from '@react-email/render';
import type { EmailMessage, EmailSender } from './types';

export class ConsoleEmailSender implements EmailSender {
  async send(message: EmailMessage): Promise<void> {
    const text = await render(message.react, { plainText: true });
    console.log(`[email:consola] Para: ${message.to} | Asunto: ${message.subject}\n${text}`);
  }
}
