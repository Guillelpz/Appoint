import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

const sendDueRemindersMock = vi.fn();

vi.mock('@/lib/email/reminders', () => ({
  sendDueReminders: (...args: unknown[]) => sendDueRemindersMock(...args),
}));

vi.mock('@/lib/db', () => ({
  prisma: {},
}));

import { GET } from './route';

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;

describe('GET /api/cron/reminders', () => {
  beforeEach(() => {
    sendDueRemindersMock.mockReset();
    process.env.CRON_SECRET = 'secreto-test';
  });

  afterAll(() => {
    process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
  });

  it('devuelve 401 si falta la cabecera de autorización', async () => {
    const request = new Request('http://localhost/api/cron/reminders');

    const response = await GET(request);

    expect(response.status).toBe(401);
    expect(sendDueRemindersMock).not.toHaveBeenCalled();
  });

  it('devuelve el número de recordatorios enviados si la autorización es correcta', async () => {
    sendDueRemindersMock.mockResolvedValue({ sent: 3 });
    const request = new Request('http://localhost/api/cron/reminders', {
      headers: { authorization: 'Bearer secreto-test' },
    });

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ sent: 3 });
  });

  it('devuelve 500 y un mensaje de error genérico si sendDueReminders lanza, sin filtrar el error original', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    sendDueRemindersMock.mockRejectedValue(new Error('fallo de conexión a la base de datos'));
    const request = new Request('http://localhost/api/cron/reminders', {
      headers: { authorization: 'Bearer secreto-test' },
    });

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: 'Error interno' });
    expect(consoleErrorSpy).toHaveBeenCalledWith('[cron/reminders]', expect.any(Error));

    consoleErrorSpy.mockRestore();
  });
});
