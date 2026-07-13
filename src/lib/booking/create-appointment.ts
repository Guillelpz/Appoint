import { Prisma, type PrismaClient, type Appointment } from '@prisma/client';
import { getAvailableSlots } from './slots';
import { assignAnyAvailableEmployee } from './assignment';
import {
  checkRateLimit,
  recordBookingAttempt,
  checkBlacklist,
  checkActiveAppointmentLimit,
  checkNoOverlapForCustomer,
} from './anti-fraud';
import { getLocalDateString } from './timezone';
import { PENDING_EXPIRY_MINUTES } from './active-appointments';

export interface CreateAppointmentInput {
  businessId: string;
  serviceId: string;
  employeeId?: string;
  start: Date;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  source: 'QR' | 'WEB' | 'MANUAL';
  ipAddress: string;
  now?: Date;
}

export type CreateAppointmentFailureReason =
  | 'RATE_LIMITED'
  | 'BLACKLISTED'
  | 'CUSTOMER_LIMIT_REACHED'
  | 'CUSTOMER_OVERLAP'
  | 'EMPLOYEE_UNAVAILABLE'
  | 'NO_EMPLOYEE_AVAILABLE'
  | 'SLOT_TAKEN';

export type CreateAppointmentResult =
  | { ok: true; appointment: Appointment }
  | { ok: false; reason: CreateAppointmentFailureReason };

async function isEmployeeAvailableAt(
  prisma: PrismaClient,
  params: { businessId: string; serviceId: string; employeeId: string; start: Date; now: Date }
): Promise<boolean> {
  const localDate = getLocalDateString(params.start);
  const slots = await getAvailableSlots(prisma, {
    businessId: params.businessId,
    serviceId: params.serviceId,
    employeeId: params.employeeId,
    dateFrom: localDate,
    dateTo: localDate,
    now: params.now,
  });

  return slots.some((slot) => slot.start.getTime() === params.start.getTime());
}

export async function createAppointment(
  prisma: PrismaClient,
  input: CreateAppointmentInput
): Promise<CreateAppointmentResult> {
  const now = input.now ?? new Date();

  await recordBookingAttempt(prisma, { businessId: input.businessId, ipAddress: input.ipAddress });

  const withinRateLimit = await checkRateLimit(prisma, {
    businessId: input.businessId,
    ipAddress: input.ipAddress,
    now,
  });
  if (!withinRateLimit) {
    return { ok: false, reason: 'RATE_LIMITED' };
  }

  const notBlacklisted = await checkBlacklist(prisma, {
    businessId: input.businessId,
    phone: input.customerPhone,
    email: input.customerEmail,
  });
  if (!notBlacklisted) {
    return { ok: false, reason: 'BLACKLISTED' };
  }

  const withinActiveLimit = await checkActiveAppointmentLimit(prisma, {
    businessId: input.businessId,
    phone: input.customerPhone,
    email: input.customerEmail,
    now,
  });
  if (!withinActiveLimit) {
    return { ok: false, reason: 'CUSTOMER_LIMIT_REACHED' };
  }

  const service = await prisma.service.findUniqueOrThrow({ where: { id: input.serviceId } });
  const end = new Date(input.start.getTime() + (service.durationMinutes + service.bufferAfterMinutes) * 60 * 1000);

  const noOverlap = await checkNoOverlapForCustomer(prisma, {
    businessId: input.businessId,
    phone: input.customerPhone,
    email: input.customerEmail,
    start: input.start,
    end,
    now,
  });
  if (!noOverlap) {
    return { ok: false, reason: 'CUSTOMER_OVERLAP' };
  }

  let employeeId: string;
  if (input.employeeId) {
    const available = await isEmployeeAvailableAt(prisma, {
      businessId: input.businessId,
      serviceId: input.serviceId,
      employeeId: input.employeeId,
      start: input.start,
      now,
    });
    if (!available) {
      return { ok: false, reason: 'EMPLOYEE_UNAVAILABLE' };
    }
    employeeId = input.employeeId;
  } else {
    const assigned = await assignAnyAvailableEmployee(prisma, {
      businessId: input.businessId,
      serviceId: input.serviceId,
      start: input.start,
      now,
    });
    if (!assigned) {
      return { ok: false, reason: 'NO_EMPLOYEE_AVAILABLE' };
    }
    employeeId = assigned;
  }

  try {
    const appointment = await prisma.$transaction(async (tx) => {
      // Libera las PENDING caducadas que ocupan este mismo (employeeId, start):
      // getAvailableSlots ya las ignora (expiración perezosa), pero siguen
      // cumpliendo el predicado del índice único parcial
      // WHERE status IN ('PENDING','CONFIRMED'), y sin este paso el INSERT
      // chocaría con el índice y devolvería un SLOT_TAKEN falso.
      const pendingCutoff = new Date(now.getTime() - PENDING_EXPIRY_MINUTES * 60 * 1000);
      await tx.appointment.updateMany({
        where: {
          employeeId,
          start: input.start,
          status: 'PENDING',
          createdAt: { lte: pendingCutoff },
        },
        data: { status: 'CANCELLED' },
      });

      const customer = await tx.customer.upsert({
        where: {
          businessId_email: { businessId: input.businessId, email: input.customerEmail },
        },
        update: { name: input.customerName, phone: input.customerPhone },
        create: {
          businessId: input.businessId,
          name: input.customerName,
          phone: input.customerPhone,
          email: input.customerEmail,
        },
      });

      return tx.appointment.create({
        data: {
          businessId: input.businessId,
          serviceId: input.serviceId,
          employeeId,
          customerId: customer.id,
          customerName: input.customerName,
          customerPhone: input.customerPhone,
          customerEmail: input.customerEmail,
          start: input.start,
          end,
          status: 'PENDING',
          source: input.source,
        },
      });
    });

    return { ok: true, appointment };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { ok: false, reason: 'SLOT_TAKEN' };
    }
    throw error;
  }
}
