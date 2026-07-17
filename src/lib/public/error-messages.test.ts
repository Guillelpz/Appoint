import { describe, it, expect } from 'vitest';
import { getBookingErrorMessage, getCancelErrorMessage } from './error-messages';
import type { CreateAppointmentFailureReason } from '@/lib/booking/create-appointment';

describe('getBookingErrorMessage', () => {
  const reasons: CreateAppointmentFailureReason[] = [
    'RATE_LIMITED',
    'BLACKLISTED',
    'CUSTOMER_LIMIT_REACHED',
    'CUSTOMER_OVERLAP',
    'EMPLOYEE_UNAVAILABLE',
    'NO_EMPLOYEE_AVAILABLE',
    'SLOT_TAKEN',
    'CUSTOMER_CONFLICT',
    'BUSINESS_NOT_FOUND',
    'SERVICE_NOT_FOUND',
  ];

  it.each(reasons)('devuelve un mensaje no vacío en español para %s', (reason) => {
    const message = getBookingErrorMessage(reason);
    expect(message.length).toBeGreaterThan(0);
  });

  it('el mensaje de SLOT_TAKEN anticipa que se proponen otras horas', () => {
    expect(getBookingErrorMessage('SLOT_TAKEN')).toContain('otras horas');
  });
});

describe('getCancelErrorMessage', () => {
  it('NOT_FOUND e INVALID_STATE devuelven mensajes no vacíos', () => {
    expect(getCancelErrorMessage('NOT_FOUND').length).toBeGreaterThan(0);
    expect(getCancelErrorMessage('INVALID_STATE').length).toBeGreaterThan(0);
  });
});
