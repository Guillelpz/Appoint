import { ConsoleEmailSender } from './console-sender';
import { ResendEmailSender } from './resend-sender';
import type { EmailSender } from './types';

export function getEmailSender(): EmailSender {
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) {
    return new ResendEmailSender(apiKey);
  }
  return new ConsoleEmailSender();
}
