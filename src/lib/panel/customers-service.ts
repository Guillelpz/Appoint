import type { PrismaClient, Customer, BlacklistEntry } from '@prisma/client';

export interface CustomerListItem extends Customer {
  appointmentCount: number;
  lastAppointmentStart: Date | null;
  blacklisted: boolean;
}

export async function listCustomersForBusiness(prisma: PrismaClient, businessId: string): Promise<CustomerListItem[]> {
  const [customers, blacklistEntries] = await Promise.all([
    prisma.customer.findMany({
      where: { businessId },
      include: { appointments: { select: { start: true } } },
      orderBy: { name: 'asc' },
    }),
    prisma.blacklistEntry.findMany({ where: { businessId } }),
  ]);

  return customers.map((customer) => {
    const starts = customer.appointments.map((a) => a.start.getTime());
    // entry.phone/email se comprueban como truthy ANTES de comparar: así un
    // customer.phone === null nunca "empareja" con una entrada de blacklist
    // que también tenga phone === null pero sea de otro cliente distinto.
    const blacklisted = blacklistEntries.some(
      (entry) => (entry.phone && entry.phone === customer.phone) || (entry.email && entry.email === customer.email)
    );
    return {
      ...customer,
      appointmentCount: starts.length,
      lastAppointmentStart: starts.length > 0 ? new Date(Math.max(...starts)) : null,
      blacklisted,
    };
  });
}

export interface CustomerDetail extends Customer {
  appointments: Array<{ id: string; start: Date; status: string; serviceName: string; employeeName: string }>;
  blacklisted: boolean;
}

// Construye el filtro OR de blacklist a partir de los campos de contacto NO
// NULOS de un customer. Si se incluyera {phone: null} o {email: null} sin
// filtrar, Prisma generaría "phone IS NULL", que empareja con CUALQUIER
// entrada de blacklist sin teléfono (de otro cliente), no solo con las que
// de verdad corresponden a este cliente.
function buildContactFilters(customer: { phone: string | null; email: string | null }) {
  return [customer.phone ? { phone: customer.phone } : null, customer.email ? { email: customer.email } : null].filter(
    (f): f is { phone: string } | { email: string } => f !== null
  );
}

export async function getCustomerDetail(prisma: PrismaClient, businessId: string, customerId: string): Promise<CustomerDetail | null> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { appointments: { include: { service: true, employee: true }, orderBy: { start: 'desc' } } },
  });
  if (!customer || customer.businessId !== businessId) {
    return null;
  }

  const contactFilters = buildContactFilters(customer);
  const blacklistEntry =
    contactFilters.length > 0 ? await prisma.blacklistEntry.findFirst({ where: { businessId, OR: contactFilters } }) : null;

  return {
    ...customer,
    appointments: customer.appointments.map((a) => ({
      id: a.id,
      start: a.start,
      status: a.status,
      serviceName: a.service.name,
      employeeName: a.employee.name,
    })),
    blacklisted: blacklistEntry !== null,
  };
}

export type BlacklistMutationResult = { ok: true; entry: BlacklistEntry } | { ok: false; reason: 'NOT_FOUND' | 'NO_CONTACT_INFO' };

export async function addCustomerToBlacklist(
  prisma: PrismaClient,
  businessId: string,
  customerId: string,
  reason: string | null
): Promise<BlacklistMutationResult> {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer || customer.businessId !== businessId) {
    return { ok: false, reason: 'NOT_FOUND' };
  }
  if (!customer.phone && !customer.email) {
    return { ok: false, reason: 'NO_CONTACT_INFO' };
  }
  const entry = await prisma.blacklistEntry.create({
    data: { businessId, phone: customer.phone, email: customer.email, reason: reason?.trim() || null },
  });
  return { ok: true, entry };
}

export async function removeCustomerFromBlacklist(prisma: PrismaClient, businessId: string, customerId: string): Promise<{ ok: true }> {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer || customer.businessId !== businessId) {
    return { ok: true };
  }

  const contactFilters = buildContactFilters(customer);
  if (contactFilters.length > 0) {
    await prisma.blacklistEntry.deleteMany({ where: { businessId, OR: contactFilters } });
  }
  return { ok: true };
}
