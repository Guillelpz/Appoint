import type { PrismaClient, Employee } from '@prisma/client';

export interface EmployeeInput {
  name: string;
  color: string;
  active: boolean;
  serviceIds: string[];
}

export type EmployeeMutationResult = { ok: true; employee: Employee } | { ok: false; reason: 'INVALID_INPUT' | 'NOT_FOUND' };

const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

function isValidEmployeeInput(input: EmployeeInput): boolean {
  const name = input.name.trim();
  return name.length > 0 && name.length <= 120 && HEX_COLOR_PATTERN.test(input.color);
}

// La tabla ServiceEmployee no tiene businessId ni restricción a nivel de BD que impida
// enlazar un empleado con un servicio de otro negocio: hay que comprobarlo aquí antes de
// escribir cualquier enlace.
async function serviceIdsBelongToBusiness(prisma: PrismaClient, businessId: string, serviceIds: string[]): Promise<boolean> {
  const uniqueIds = [...new Set(serviceIds)];
  if (uniqueIds.length === 0) {
    return true;
  }
  const owned = await prisma.service.findMany({ where: { id: { in: uniqueIds }, businessId }, select: { id: true } });
  return owned.length === uniqueIds.length;
}

export async function listEmployeesForBusiness(prisma: PrismaClient, businessId: string) {
  return prisma.employee.findMany({
    where: { businessId },
    include: { services: { include: { service: true } } },
    orderBy: { name: 'asc' },
  });
}

export async function getEmployeeForBusiness(prisma: PrismaClient, businessId: string, employeeId: string) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: { services: true, workingHours: true, timeOff: true },
  });
  if (!employee || employee.businessId !== businessId) {
    return null;
  }
  return employee;
}

export async function createEmployeeForBusiness(
  prisma: PrismaClient,
  businessId: string,
  input: EmployeeInput
): Promise<EmployeeMutationResult> {
  if (!isValidEmployeeInput(input)) {
    return { ok: false, reason: 'INVALID_INPUT' };
  }
  if (!(await serviceIdsBelongToBusiness(prisma, businessId, input.serviceIds))) {
    return { ok: false, reason: 'INVALID_INPUT' };
  }
  const employee = await prisma.employee.create({
    data: {
      businessId,
      name: input.name.trim(),
      color: input.color,
      active: input.active,
      services: { create: input.serviceIds.map((serviceId) => ({ serviceId })) },
    },
  });
  return { ok: true, employee };
}

// No usa un claim atómico updateMany-scoped como el resto del panel (p.ej.
// services-service.ts). La comprobación previa (findUnique + businessId) no sufre una
// ventana TOCTOU real hoy: nada en la aplicación reasigna Employee.businessId una vez
// creado el empleado, así que no hay ninguna escritura concurrente que pueda "mover" el
// empleado a otro negocio entre la lectura y el $transaction siguiente. Si en el futuro se
// permite reasignar el negocio de un empleado, esta función deberá migrar al mismo patrón
// updateMany-scoped que el resto del panel.
export async function updateEmployeeForBusiness(
  prisma: PrismaClient,
  businessId: string,
  employeeId: string,
  input: EmployeeInput
): Promise<EmployeeMutationResult> {
  if (!isValidEmployeeInput(input)) {
    return { ok: false, reason: 'INVALID_INPUT' };
  }
  const existing = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!existing || existing.businessId !== businessId) {
    return { ok: false, reason: 'NOT_FOUND' };
  }
  if (!(await serviceIdsBelongToBusiness(prisma, businessId, input.serviceIds))) {
    return { ok: false, reason: 'INVALID_INPUT' };
  }

  await prisma.$transaction([
    prisma.employee.update({
      where: { id: employeeId },
      data: { name: input.name.trim(), color: input.color, active: input.active },
    }),
    prisma.serviceEmployee.deleteMany({ where: { employeeId } }),
    prisma.serviceEmployee.createMany({ data: input.serviceIds.map((serviceId) => ({ serviceId, employeeId })) }),
  ]);

  const employee = await prisma.employee.findUniqueOrThrow({ where: { id: employeeId } });
  return { ok: true, employee };
}
