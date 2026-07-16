import { describe, it, expect, afterEach } from 'vitest';
import { getEmailSender } from './get-email-sender';
import { ResendEmailSender } from './resend-sender';
import { ConsoleEmailSender } from './console-sender';

describe('getEmailSender', () => {
  const originalApiKey = process.env.RESEND_API_KEY;

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.RESEND_API_KEY;
    } else {
      process.env.RESEND_API_KEY = originalApiKey;
    }
  });

  it('devuelve ResendEmailSender si RESEND_API_KEY está definida', () => {
    process.env.RESEND_API_KEY = 're_test_key';
    expect(getEmailSender()).toBeInstanceOf(ResendEmailSender);
  });

  it('devuelve ConsoleEmailSender si RESEND_API_KEY no está definida', () => {
    delete process.env.RESEND_API_KEY;
    expect(getEmailSender()).toBeInstanceOf(ConsoleEmailSender);
  });
});
