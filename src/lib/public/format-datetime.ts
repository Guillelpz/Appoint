import { toZonedTime } from 'date-fns-tz';
import { BUSINESS_TIMEZONE, addDaysToLocalDateString, getLocalDateString } from '@/lib/booking/timezone';

const WEEKDAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const SHORT_WEEKDAY_NAMES = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const SHORT_MONTH_NAMES = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

export function formatAppointmentDateTime(utcDate: Date): string {
  const zoned = toZonedTime(utcDate, BUSINESS_TIMEZONE);
  const weekday = WEEKDAY_NAMES[zoned.getDay()];
  const day = zoned.getDate();
  const month = MONTH_NAMES[zoned.getMonth()];
  const hours = String(zoned.getHours()).padStart(2, '0');
  const minutes = String(zoned.getMinutes()).padStart(2, '0');
  return `${weekday}, ${day} de ${month} a las ${hours}:${minutes}`;
}

export function formatSlotTime(utcDate: Date): string {
  const zoned = toZonedTime(utcDate, BUSINESS_TIMEZONE);
  const hours = String(zoned.getHours()).padStart(2, '0');
  const minutes = String(zoned.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function formatPriceCents(cents: number): string {
  const euros = (cents / 100).toFixed(2).replace('.', ',');
  return `${euros} €`;
}

export function formatDurationMinutes(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining === 0 ? `${hours} h` : `${hours} h ${remaining} min`;
}

export interface DayOption {
  localDate: string;
  label: string;
}

export function buildDayOptions(now: Date, maxDays: number): DayOption[] {
  const options: DayOption[] = [];
  let current = getLocalDateString(now);

  for (let i = 0; i < maxDays; i++) {
    const [, monthStr, dayStr] = current.split('-');
    const month = Number(monthStr);
    const day = Number(dayStr);
    const weekday = new Date(`${current}T12:00:00Z`).getUTCDay();
    options.push({
      localDate: current,
      label: `${SHORT_WEEKDAY_NAMES[weekday]} ${day} ${SHORT_MONTH_NAMES[month - 1]}`,
    });
    current = addDaysToLocalDateString(current, 1);
  }

  return options;
}
