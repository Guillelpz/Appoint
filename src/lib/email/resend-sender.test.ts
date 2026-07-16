import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement } from 'react';

const sendMock = vi.fn();

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(function () {
    return { emails: { send: sendMock } };
  }),
}));

import { ResendEmailSender } from './resend-sender';

describe('ResendEmailSender', () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  it('envía el mensaje usando el remitente por defecto si no se indica uno', async () => {
    sendMock.mockResolvedValue({ data: { id: 'abc' }, error: null });
    const sender = new ResendEmailSender('re_test_key');

    await sender.send({ to: 'cliente@example.com', subject: 'Asunto', react: createElement('div', null, 'Hola') });

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'onboarding@resend.dev',
        to: 'cliente@example.com',
        subject: 'Asunto',
      })
    );
  });

  it('usa el remitente indicado explícitamente', async () => {
    sendMock.mockResolvedValue({ data: { id: 'abc' }, error: null });
    const sender = new ResendEmailSender('re_test_key', 'reservas@salonaura.example');

    await sender.send({ to: 'cliente@example.com', subject: 'Asunto', react: createElement('div', null, 'Hola') });

    expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({ from: 'reservas@salonaura.example' }));
  });

  it('lanza un error si Resend devuelve un error', async () => {
    sendMock.mockResolvedValue({ data: null, error: { message: 'clave inválida' } });
    const sender = new ResendEmailSender('re_test_key');

    await expect(
      sender.send({ to: 'cliente@example.com', subject: 'Asunto', react: createElement('div', null, 'Hola') })
    ).rejects.toThrow('clave inválida');
  });
});
