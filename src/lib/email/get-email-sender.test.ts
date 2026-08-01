import { describe, it, expect, afterEach, vi } from 'vitest';
import { getEmailSender, getDeferredTaskRunner } from './get-email-sender';
import { ResendEmailSender } from './resend-sender';
import { ConsoleEmailSender } from './console-sender';

const afterMock = vi.fn();
vi.mock('next/server', () => ({
  after: (task: () => Promise<void> | void) => afterMock(task),
}));

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

// getDeferredTaskRunner() es el equivalente de getEmailSender() para trabajo
// que debe ejecutarse DESPUÉS de responder al usuario (envíos de email en los
// servicios de reserva/aprobación/cancelación), sin bloquear la respuesta ni
// arriesgarse a que Vercel corte la función serverless antes de que el email
// salga: delega en after() de next/server, que Next garantiza que se ejecuta
// tras enviar la respuesta.
describe('getDeferredTaskRunner', () => {
  it('programa la tarea con after() de next/server en vez de ejecutarla inline', () => {
    afterMock.mockReset();
    const task = vi.fn();

    getDeferredTaskRunner().run(task);

    expect(afterMock).toHaveBeenCalledWith(task);
    // No se ejecuta de forma síncrona/inline: quien llama a run() no debe
    // esperar a que la tarea termine para continuar.
    expect(task).not.toHaveBeenCalled();
  });
});
