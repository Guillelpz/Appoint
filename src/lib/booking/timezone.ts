import { fromZonedTime, toZonedTime } from 'date-fns-tz';

export const BUSINESS_TIMEZONE = 'Europe/Madrid';

export function getLocalDateString(utcDate: Date, timezone: string = BUSINESS_TIMEZONE): string {
  const zoned = toZonedTime(utcDate, timezone);
  const year = zoned.getFullYear();
  const month = String(zoned.getMonth() + 1).padStart(2, '0');
  const day = String(zoned.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function localMinutesToUtc(
  localDateStr: string,
  minutes: number,
  timezone: string = BUSINESS_TIMEZONE
): Date {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const wallTime = `${localDateStr}T${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:00`;
  return fromZonedTime(wallTime, timezone);
}

export function addDaysToLocalDateString(localDateStr: string, days: number): string {
  const [year, month, day] = localDateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Convierte el valor de un <input type="datetime-local"> ("YYYY-MM-DDTHH:mm",
// sin zona horaria) a un Date en UTC, interpretándolo como hora local del
// negocio. Usar `new Date(valorSinZona)` aquí sería un bug: JS lo
// interpretaría como hora local del PROCESO DE NODE (normalmente UTC en
// producción), no como hora de Europe/Madrid.
export function parseLocalWallTimeToUtc(value: string, timezone: string = BUSINESS_TIMEZONE): Date {
  return fromZonedTime(value, timezone);
}

// Lunes (inicio de semana ISO) de la semana que contiene localDateStr, como
// cadena YYYY-MM-DD. Igual que addDaysToLocalDateString, opera solo sobre el
// calendario (sin zona horaria) porque localDateStr ya representa un día
// local: no hace falta volver a convertir a UTC hasta construir los límites
// finales con localMinutesToUtc (ver platform-metrics-service.ts).
export function getWeekStartLocalDateString(localDateStr: string): string {
  const [year, month, day] = localDateStr.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0=domingo..6=sábado
  const daysSinceMonday = (weekday + 6) % 7;
  return addDaysToLocalDateString(localDateStr, -daysSinceMonday);
}
