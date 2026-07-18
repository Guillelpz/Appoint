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

// No usa un claim atómico updateMany-scoped porque esta operación no envía
// ningún email (a diferencia de aprobar/rechazar/cancelar): el requisito de
// "toda transición que dispare un email usa claim atómico" no aplica aquí.
// Sigue escopado por businessId antes de escribir nada.
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
