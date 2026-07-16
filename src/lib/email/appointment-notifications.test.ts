import { describe, it, expect } from 'vitest';
import { render } from '@react-email/render';
import { FakeEmailSender } from '../../test/fake-email-sender';
import {
  sendBookingConfirmationEmail,
  sendBookingPendingApprovalEmail,
  type AppointmentEmailContext,
} from './appointment-notifications';

const BASE_CTX: AppointmentEmailContext = {
  appointment: {
    id: 'appt-1',
    customerName: 'Ana López',
    customerEmail: 'ana@example.com',
    customerPhone: '+34600111222',
    confirmToken: 'confirm-token-123',
    cancelToken: 'cancel-token-456',
    start: new Date('2026-07-14T08:00:00.000Z'),
  },
  service: { name: 'Corte de mujer' },
  employee: { name: 'Marta Ruiz' },
  business: { name: 'Salón Aura', email: 'hola@salonaura.example', accentColor: '#B25539', logoUrl: null },
};

describe('sendBookingConfirmationEmail', () => {
  it('envía al email del cliente con el enlace de confirmación y los datos de la cita', async () => {
    const sender = new FakeEmailSender();

    const result = await sendBookingConfirmationEmail(sender, BASE_CTX);

    expect(result.ok).toBe(true);
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0].to).toBe('ana@example.com');
    expect(sender.sent[0].subject).toContain('Salón Aura');

    const text = await render(sender.sent[0].react, { plainText: true });
    expect(text).toContain('Ana López');
    expect(text).toContain('Corte de mujer');
    expect(text).toContain('Marta Ruiz');
    expect(text).toContain('http://localhost:3000/confirmar/confirm-token-123');
  });

  it('devuelve ok:false y no lanza si el envío falla', async () => {
    const failingSender = { send: async () => { throw new Error('fallo de red'); } };

    const result = await sendBookingConfirmationEmail(failingSender, BASE_CTX);

    expect(result.ok).toBe(false);
  });
});

describe('sendBookingPendingApprovalEmail', () => {
  it('envía al cliente explicando el doble paso (verificar email + aprobación del negocio)', async () => {
    const sender = new FakeEmailSender();

    const result = await sendBookingPendingApprovalEmail(sender, BASE_CTX);

    expect(result.ok).toBe(true);
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0].to).toBe('ana@example.com');

    const text = await render(sender.sent[0].react, { plainText: true });
    expect(text).toContain('http://localhost:3000/confirmar/confirm-token-123');
    expect(text.toLowerCase()).toContain('aprob');
  });
});
