import { describe, it, expect, vi } from 'vitest';
import { ConsoleEmailSender } from './console-sender';

describe('ConsoleEmailSender', () => {
  it('registra el email en consola (para/asunto/contenido) sin lanzar y sin enviar nada', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const sender = new ConsoleEmailSender();

    await sender.send({
      to: 'cliente@example.com',
      subject: 'Confirma tu cita',
      react: <div>Contenido de prueba</div>,
    });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const loggedText = logSpy.mock.calls[0][0] as string;
    expect(loggedText).toContain('cliente@example.com');
    expect(loggedText).toContain('Confirma tu cita');
    expect(loggedText).toContain('Contenido de prueba');

    logSpy.mockRestore();
  });
});
