import { describe, it, expect } from 'vitest';
import { render } from '@react-email/render';
import { formatAppointmentDateTime } from '@/lib/public/format-datetime';
import { FakeEmailSender } from '../../test/fake-email-sender';
import {
  sendBookingConfirmationEmail,
  sendBookingPendingApprovalEmail,
  sendNewPendingRequestEmail,
  sendCancellationConfirmationEmail,
  sendCancellationNoticeToBusinessEmail,
  sendReminderEmail,
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

describe('sendNewPendingRequestEmail', () => {
  it('envía al email del negocio con los datos del cliente y de la cita', async () => {
    const sender = new FakeEmailSender();

    const result = await sendNewPendingRequestEmail(sender, BASE_CTX);

    expect(result.ok).toBe(true);
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0].to).toBe('hola@salonaura.example');
    expect(sender.sent[0].subject).toBe('Nueva solicitud de cita pendiente de aprobación');

    const text = await render(sender.sent[0].react, { plainText: true });
    expect(text).toContain('Ana López');
    expect(text).toContain('+34600111222');
    expect(text).toContain('ana@example.com');
    expect(text).toContain('Corte de mujer');
    expect(text).toContain('Marta Ruiz');
    expect(text).toContain(formatAppointmentDateTime(BASE_CTX.appointment.start));
  });

  it('devuelve ok:false sin lanzar si el negocio no tiene email configurado', async () => {
    const sender = new FakeEmailSender();
    const ctxSinEmail: AppointmentEmailContext = {
      ...BASE_CTX,
      business: { ...BASE_CTX.business, email: null },
    };

    const result = await sendNewPendingRequestEmail(sender, ctxSinEmail);

    expect(result.ok).toBe(false);
    expect(sender.sent).toHaveLength(0);
  });
});

describe('sendCancellationConfirmationEmail', () => {
  it('envía al cliente confirmando la cancelación', async () => {
    const sender = new FakeEmailSender();

    const result = await sendCancellationConfirmationEmail(sender, BASE_CTX);

    expect(result.ok).toBe(true);
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0].to).toBe('ana@example.com');

    const text = await render(sender.sent[0].react, { plainText: true });
    expect(text).toContain('Corte de mujer');
    expect(text.toLowerCase()).toContain('cancelad');
  });
});

describe('sendCancellationNoticeToBusinessEmail', () => {
  it('envía al negocio avisando de la cancelación del cliente', async () => {
    const sender = new FakeEmailSender();

    const result = await sendCancellationNoticeToBusinessEmail(sender, BASE_CTX);

    expect(result.ok).toBe(true);
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0].to).toBe('hola@salonaura.example');

    const text = await render(sender.sent[0].react, { plainText: true });
    expect(text).toContain('Ana López');
  });

  it('devuelve ok:false sin lanzar si el negocio no tiene email configurado', async () => {
    const sender = new FakeEmailSender();
    const ctxSinEmail: AppointmentEmailContext = {
      ...BASE_CTX,
      business: { ...BASE_CTX.business, email: null },
    };

    const result = await sendCancellationNoticeToBusinessEmail(sender, ctxSinEmail);

    expect(result.ok).toBe(false);
    expect(sender.sent).toHaveLength(0);
  });
});

describe('sendReminderEmail', () => {
  it('envía al cliente con el enlace de cancelación', async () => {
    const sender = new FakeEmailSender();

    const result = await sendReminderEmail(sender, BASE_CTX);

    expect(result.ok).toBe(true);
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0].to).toBe('ana@example.com');

    const text = await render(sender.sent[0].react, { plainText: true });
    expect(text).toContain('http://localhost:3000/cita/cancel-token-456');
    expect(text).toContain('Corte de mujer');
  });
});
