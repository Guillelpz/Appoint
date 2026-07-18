import { Prisma, type PrismaClient, type Appointment, type Customer } from '@prisma/client';
import { isEmployeeAvailableAt, classifyUniqueViolation } from '@/lib/booking/create-appointment';
import { releaseExpiredPendingSlot } from '@/lib/booking/active-appointments';
import { validateManualAppointmentInput } from '@/lib/public/validate-booking-input';
import { getEmailSender } from '@/lib/email/get-email-sender';
import type { EmailSender } from '@/lib/email/types';
import { sendAppointmentApprovedEmail } from '@/lib/email/appointment-notifications';

export interface CreateManualAppointmentInput {
  businessId: string;
  serviceId: string;
  employeeId: string;
  start: Date;
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  now?: Date;
  emailSender?: EmailSender;
}

export type CreateManualAppointmentFailureReason =
  | 'INVALID_INPUT'
  | 'SERVICE_NOT_FOUND'
  | 'EMPLOYEE_UNAVAILABLE'
  | 'SLOT_TAKEN'
  | 'CUSTOMER_CONFLICT';

export type CreateManualAppointmentResult =
  | { ok: true; appointment: Appointment }
  | { ok: false; reason: CreateManualAppointmentFailureReason };

// Resuelve el Customer del negocio a reutilizar para una cita manual. A
// diferencia de createAppointment (que siempre exige email y hace upsert por
// businessId_email), aquí el contacto es opcional:
// - Con email: upsert por (businessId, email), igual que el flujo público.
// - Sin email pero con teléfono: busca por (businessId, phone); si existe,
//   actualiza el nombre; si no, crea uno nuevo.
// - Sin ningún contacto: siempre crea un Customer nuevo. No se reutiliza
//   ningún registro existente por coincidencia de NULL: en Postgres cada
//   NULL es distinto de cualquier otro, y Prisma no permite un
//   findUnique/upsert fiable sobre un valor NULL en un índice único
//   compuesto — intentar "encontrar" un cliente sin contacto por sus campos
//   NULL emparejaría entre sí a clientes que en realidad son personas
//   distintas.
async function resolveOrCreateManualCustomer(
  tx: Prisma.TransactionClient,
  params: { businessId: string; name: string; phone: string | null; email: string | null }
): Promise<Customer> {
  if (params.email) {
    return tx.customer.upsert({
      where: { businessId_email: { businessId: params.businessId, email: params.email } },
      update: { name: params.name, phone: params.phone ?? undefined },
      create: { businessId: params.businessId, name: params.name, phone: params.phone, email: params.email },
    });
  }

  if (params.phone) {
    const existing = await tx.customer.findUnique({
      where: { businessId_phone: { businessId: params.businessId, phone: params.phone } },
    });
    if (existing) {
      return tx.customer.update({ where: { id: existing.id }, data: { name: params.name } });
    }
    return tx.customer.create({
      data: { businessId: params.businessId, name: params.name, phone: params.phone, email: null },
    });
  }

  return tx.customer.create({
    data: { businessId: params.businessId, name: params.name, phone: null, email: null },
  });
}

export async function createManualAppointmentForBusiness(
  prisma: PrismaClient,
  input: CreateManualAppointmentInput
): Promise<CreateManualAppointmentResult> {
  const now = input.now ?? new Date();
  const emailSender = input.emailSender ?? getEmailSender();

  const validation = validateManualAppointmentInput({
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    customerEmail: input.customerEmail,
  });
  if (!validation.ok) {
    return { ok: false, reason: 'INVALID_INPUT' };
  }

  const service = await prisma.service.findUnique({ where: { id: input.serviceId } });
  if (!service || service.businessId !== input.businessId) {
    return { ok: false, reason: 'SERVICE_NOT_FOUND' };
  }

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

  const end = new Date(input.start.getTime() + (service.durationMinutes + service.bufferAfterMinutes) * 60 * 1000);

  let appointment: Appointment;
  try {
    appointment = await prisma.$transaction(async (tx) => {
      await releaseExpiredPendingSlot(tx, { employeeId: input.employeeId, start: input.start, now });

      const customer = await resolveOrCreateManualCustomer(tx, {
        businessId: input.businessId,
        name: validation.value.customerName,
        phone: validation.value.customerPhone,
        email: validation.value.customerEmail,
      });

      return tx.appointment.create({
        data: {
          businessId: input.businessId,
          serviceId: input.serviceId,
          employeeId: input.employeeId,
          customerId: customer.id,
          customerName: validation.value.customerName,
          customerPhone: validation.value.customerPhone,
          customerEmail: validation.value.customerEmail,
          start: input.start,
          end,
          status: 'CONFIRMED',
          source: 'MANUAL',
        },
      });
    });
  } catch (error) {
    // Reutiliza classifyUniqueViolation de create-appointment.ts: distingue
    // el índice único parcial (employeeId, start) de citas activas
    // (SLOT_TAKEN) de los índices únicos de Customer businessId_phone /
    // businessId_email (CUSTOMER_CONFLICT — el teléfono o email indicado ya
    // pertenece a otro cliente del negocio con datos distintos). Cualquier
    // otro P2002 se relanza sin enmascarar.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const reason = classifyUniqueViolation(error);
      if (reason) {
        return { ok: false, reason };
      }
    }
    throw error;
  }

  // Envío best-effort después de que la cita ya se ha creado con éxito:
  // reutiliza la misma plantilla de "cita aprobada" que la aprobación
  // manual de pendientes (decisión de producto: mismo copy en ambos casos).
  if (appointment.customerEmail) {
    const withRelations = await prisma.appointment.findUnique({
      where: { id: appointment.id },
      include: { service: true, employee: true, business: true },
    });
    if (withRelations) {
      await sendAppointmentApprovedEmail(emailSender, {
        appointment: withRelations,
        service: withRelations.service,
        employee: withRelations.employee,
        business: withRelations.business,
      });
    }
  }

  return { ok: true, appointment };
}
