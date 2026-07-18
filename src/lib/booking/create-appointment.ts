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
import { releaseExpiredPendingSlot } from './active-appointments';

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
  | 'BUSINESS_NOT_FOUND'
  | 'SERVICE_NOT_FOUND'
  | 'RATE_LIMITED'
  | 'BLACKLISTED'
  | 'CUSTOMER_LIMIT_REACHED'
  | 'CUSTOMER_OVERLAP'
  | 'EMPLOYEE_UNAVAILABLE'
  | 'NO_EMPLOYEE_AVAILABLE'
  | 'SLOT_TAKEN'
  | 'CUSTOMER_CONFLICT';

export type CreateAppointmentResult =
  | { ok: true; appointment: Appointment }
  | { ok: false; reason: CreateAppointmentFailureReason };

export async function isEmployeeAvailableAt(
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

  const business = await prisma.business.findUnique({ where: { id: input.businessId } });
  if (!business) {
    return { ok: false, reason: 'BUSINESS_NOT_FOUND' };
  }

  // Se registra el intento solo una vez comprobado que el negocio existe
  // (evita un P2003 crudo por la FK de BookingAttempt.businessId), pero
  // antes del resto de comprobaciones, para que los intentos rechazados
  // sigan contando de cara al límite de tasa.
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

  const service = await prisma.service.findUnique({ where: { id: input.serviceId } });
  if (!service || service.businessId !== input.businessId) {
    return { ok: false, reason: 'SERVICE_NOT_FOUND' };
  }
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
    const [serviceEmployee, employee] = await Promise.all([
      prisma.serviceEmployee.findUnique({
        where: { serviceId_employeeId: { serviceId: input.serviceId, employeeId: input.employeeId } },
      }),
      prisma.employee.findUnique({ where: { id: input.employeeId } }),
    ]);
    if (!serviceEmployee || !employee || !employee.active || employee.businessId !== input.businessId) {
      return { ok: false, reason: 'EMPLOYEE_UNAVAILABLE' };
    }

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
      // Libera las PENDING caducadas (por tiempo, no verificadas) que ocupan
      // este mismo (employeeId, start): getAvailableSlots ya las ignora
      // (expiración perezosa), pero siguen cumpliendo el predicado del
      // índice único parcial WHERE status IN ('PENDING','CONFIRMED'), y sin
      // este paso el INSERT chocaría con el índice y devolvería un
      // SLOT_TAKEN falso.
      await releaseExpiredPendingSlot(tx, { employeeId, start: input.start, now });

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
      const reason = classifyUniqueViolation(error);
      if (reason) {
        return { ok: false, reason };
      }
    }
    throw error;
  }
}

// Distingue qué restricción única disparó el P2002 dentro de la transacción.
// Comprobado empíricamente (Prisma 6.19 + PostgreSQL):
// - Índice único parcial Appointment_employeeId_start_active_key:
//     meta = { modelName: 'Appointment', target: ['employeeId', 'start'] }
// - Customer businessId_phone: meta = { modelName: 'Customer', target: ['businessId', 'phone'] }
// - Customer businessId_email: meta = { modelName: 'Customer', target: ['businessId', 'email'] }
// Se acepta también target como string (nombre de constraint) por robustez
// ante variaciones del motor. Cualquier otro P2002 (p. ej. colisión
// astronómicamente improbable de confirmToken/cancelToken) devuelve null y
// el llamador relanza el error: no debe enmascararse como fallo de negocio.
function classifyUniqueViolation(
  error: Prisma.PrismaClientKnownRequestError
): Extract<CreateAppointmentFailureReason, 'SLOT_TAKEN' | 'CUSTOMER_CONFLICT'> | null {
  const meta = error.meta as { modelName?: unknown; target?: unknown } | undefined;
  const rawTarget = meta?.target;
  const targets = Array.isArray(rawTarget)
    ? rawTarget.map(String)
    : typeof rawTarget === 'string'
      ? [rawTarget]
      : [];

  const matchesSlotIndex =
    (targets.includes('employeeId') && targets.includes('start')) ||
    targets.some((t) => t.includes('employeeId_start'));
  if (matchesSlotIndex) {
    return 'SLOT_TAKEN';
  }

  const matchesCustomerIdentity =
    meta?.modelName === 'Customer' ||
    (targets.includes('businessId') && (targets.includes('phone') || targets.includes('email'))) ||
    targets.some((t) => t.includes('businessId_phone') || t.includes('businessId_email'));
  if (matchesCustomerIdentity) {
    return 'CUSTOMER_CONFLICT';
  }

  return null;
}
