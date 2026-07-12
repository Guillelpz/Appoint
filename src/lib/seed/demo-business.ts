import { PrismaClient, Business, Employee, Service, BusinessType, ThemePreset } from '@prisma/client';

export interface DemoBusinessSeed {
  business: Business;
  employees: {
    marta: Employee;
    carlos: Employee;
  };
  services: {
    corteMujer: Service;
    corteHombre: Service;
    coloracion: Service;
    peinadoEvento: Service;
  };
}

const WEEKDAYS_TUE_TO_SAT = [2, 3, 4, 5, 6];

export async function seedDemoBusiness(prisma: PrismaClient): Promise<DemoBusinessSeed> {
  const business = await prisma.business.create({
    data: {
      slug: 'salon-aura',
      name: 'Salón Aura',
      type: BusinessType.HAIR_SALON,
      address: 'Calle Mayor 10, Madrid',
      phone: '+34600111222',
      email: 'hola@salonaura.example',
      themePreset: ThemePreset.BOUTIQUE_EDITORIAL,
      accentColor: '#B25539',
      manualApproval: false,
      slotGranularityMinutes: 15,
      minAdvanceNoticeMinutes: 60,
      maxBookingWindowDays: 30,
      active: true,
    },
  });

  const marta = await prisma.employee.create({
    data: {
      businessId: business.id,
      name: 'Marta Ruiz',
      color: '#B25539',
      active: true,
    },
  });

  const carlos = await prisma.employee.create({
    data: {
      businessId: business.id,
      name: 'Carlos Núñez',
      color: '#4A6C6F',
      active: true,
    },
  });

  const corteMujer = await prisma.service.create({
    data: {
      businessId: business.id,
      name: 'Corte de mujer',
      description: 'Corte y peinado adaptado a tu estilo.',
      durationMinutes: 45,
      priceCents: 2800,
      bufferAfterMinutes: 10,
      active: true,
      sortOrder: 1,
    },
  });

  const corteHombre = await prisma.service.create({
    data: {
      businessId: business.id,
      name: 'Corte de hombre',
      description: 'Corte clásico o moderno.',
      durationMinutes: 30,
      priceCents: 1800,
      bufferAfterMinutes: 5,
      active: true,
      sortOrder: 2,
    },
  });

  const coloracion = await prisma.service.create({
    data: {
      businessId: business.id,
      name: 'Coloración',
      description: 'Color completo con productos profesionales.',
      durationMinutes: 90,
      priceCents: 6000,
      bufferAfterMinutes: 15,
      active: true,
      sortOrder: 3,
    },
  });

  const peinadoEvento = await prisma.service.create({
    data: {
      businessId: business.id,
      name: 'Peinado de evento',
      description: 'Peinado especial para ocasiones especiales.',
      durationMinutes: 60,
      priceCents: 4000,
      bufferAfterMinutes: 10,
      active: true,
      sortOrder: 4,
    },
  });

  await prisma.serviceEmployee.createMany({
    data: [
      { serviceId: corteMujer.id, employeeId: marta.id },
      { serviceId: corteHombre.id, employeeId: marta.id },
      { serviceId: coloracion.id, employeeId: marta.id },
      { serviceId: peinadoEvento.id, employeeId: marta.id },
      { serviceId: corteMujer.id, employeeId: carlos.id },
      { serviceId: corteHombre.id, employeeId: carlos.id },
    ],
  });

  const martaWorkingHours = WEEKDAYS_TUE_TO_SAT.flatMap((weekday) => [
    { employeeId: marta.id, weekday, startMinute: 600, endMinute: 840 },
    { employeeId: marta.id, weekday, startMinute: 960, endMinute: 1200 },
  ]);

  const carlosWorkingHours = WEEKDAYS_TUE_TO_SAT.map((weekday) => ({
    employeeId: carlos.id,
    weekday,
    startMinute: 960,
    endMinute: 1200,
  }));

  await prisma.workingHours.createMany({
    data: [...martaWorkingHours, ...carlosWorkingHours],
  });

  await prisma.timeOff.create({
    data: {
      employeeId: marta.id,
      start: new Date('2026-08-15T08:00:00.000Z'),
      end: new Date('2026-08-15T22:00:00.000Z'),
      reason: 'Día festivo local',
    },
  });

  return {
    business,
    employees: { marta, carlos },
    services: { corteMujer, corteHombre, coloracion, peinadoEvento },
  };
}
