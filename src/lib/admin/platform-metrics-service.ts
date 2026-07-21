import type { PrismaClient } from '@prisma/client';
import {
  BUSINESS_TIMEZONE,
  getLocalDateString,
  getWeekStartLocalDateString,
  addDaysToLocalDateString,
  localMinutesToUtc,
} from '@/lib/booking/timezone';

export interface PlatformMetrics {
  activeBusinessCount: number;
  appointmentsThisWeekCount: number;
}

// Alcance de plataforma: agrega sobre TODOS los negocios, sin businessId de
// sesión (no aplica multi-tenancy aquí, es justo lo contrario: es un
// agregado cross-tenant intencional para el dashboard de /admin).
// appointmentsThisWeekCount cuenta citas de CUALQUIER estado (incluidas
// CANCELLED/NO_SHOW) y de negocios suspendidos: es la interpretación más
// simple de "citas de la semana" y coincide con lo que pide la spec sin
// añadir filtros no solicitados.
export async function getPlatformMetrics(prisma: PrismaClient, now: Date): Promise<PlatformMetrics> {
  const todayLocal = getLocalDateString(now, BUSINESS_TIMEZONE);
  const weekStartLocal = getWeekStartLocalDateString(todayLocal);
  const weekEndLocal = addDaysToLocalDateString(weekStartLocal, 7);
  const weekStartUtc = localMinutesToUtc(weekStartLocal, 0, BUSINESS_TIMEZONE);
  const weekEndUtc = localMinutesToUtc(weekEndLocal, 0, BUSINESS_TIMEZONE);

  const [activeBusinessCount, appointmentsThisWeekCount] = await Promise.all([
    prisma.business.count({ where: { active: true } }),
    prisma.appointment.count({ where: { start: { gte: weekStartUtc, lt: weekEndUtc } } }),
  ]);

  return { activeBusinessCount, appointmentsThisWeekCount };
}
