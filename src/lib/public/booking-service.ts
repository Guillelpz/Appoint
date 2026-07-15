import type { PrismaClient } from '@prisma/client';
import { createAppointment } from '@/lib/booking/create-appointment';
import { getLocalDateString } from '@/lib/booking/timezone';
import { getBookingErrorMessage, INVALID_INPUT_MESSAGE } from './error-messages';
import { getAvailableSlotsForBusiness } from './slots-service';
import { validateBookingInput } from './validate-booking-input';

export interface BookAppointmentBySlugInput {
  slug: string;
  serviceId: string;
  employeeId?: string;
  start: Date;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  ipAddress: string;
  now?: Date;
}

export type BookAppointmentBySlugResult =
  | { ok: true; confirmToken: string; cancelToken: string; pendingApproval: boolean }
  | { ok: false; message: string; alternativeSlots: Date[] };

export async function bookAppointmentBySlug(
  prisma: PrismaClient,
  input: BookAppointmentBySlugInput
): Promise<BookAppointmentBySlugResult> {
  const now = input.now ?? new Date();

  const validation = validateBookingInput({
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    customerEmail: input.customerEmail,
    start: input.start,
  });
  if (!validation.ok) {
    return { ok: false, message: INVALID_INPUT_MESSAGE, alternativeSlots: [] };
  }

  const business = await prisma.business.findUnique({ where: { slug: input.slug } });

  if (!business || !business.active) {
    return { ok: false, message: getBookingErrorMessage('BUSINESS_NOT_FOUND'), alternativeSlots: [] };
  }

  const result = await createAppointment(prisma, {
    businessId: business.id,
    serviceId: input.serviceId,
    employeeId: input.employeeId,
    start: input.start,
    customerName: validation.value.customerName,
    customerPhone: validation.value.customerPhone,
    customerEmail: validation.value.customerEmail,
    source: 'WEB',
    ipAddress: input.ipAddress,
    now,
  });

  if (result.ok) {
    return {
      ok: true,
      confirmToken: result.appointment.confirmToken,
      cancelToken: result.appointment.cancelToken,
      pendingApproval: business.manualApproval,
    };
  }

  const message = getBookingErrorMessage(result.reason);
  let alternativeSlots: Date[] = [];

  if (result.reason === 'SLOT_TAKEN') {
    const localDate = getLocalDateString(input.start);
    const slots = await getAvailableSlotsForBusiness(prisma, {
      slug: input.slug,
      serviceId: input.serviceId,
      employeeId: input.employeeId,
      dateFrom: localDate,
      dateTo: localDate,
      now,
    });
    alternativeSlots = slots.slice(0, 5).map((s) => s.start);
  }

  return { ok: false, message, alternativeSlots };
}
