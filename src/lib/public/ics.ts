export interface IcsAppointmentInput {
  uid: string;
  businessName: string;
  serviceName: string;
  employeeName: string;
  address?: string | null;
  start: Date;
  end: Date;
  now?: Date;
}

function formatIcsDateUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function escapeIcsText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

export function generateAppointmentIcs(input: IcsAppointmentInput): string {
  const now = input.now ?? new Date();

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Appoint//Reservas//ES',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${input.uid}`,
    `DTSTAMP:${formatIcsDateUtc(now)}`,
    `DTSTART:${formatIcsDateUtc(input.start)}`,
    `DTEND:${formatIcsDateUtc(input.end)}`,
    `SUMMARY:${escapeIcsText(`${input.serviceName} — ${input.businessName}`)}`,
    `DESCRIPTION:${escapeIcsText(`Cita con ${input.employeeName} en ${input.businessName}.`)}`,
  ];

  if (input.address) {
    lines.push(`LOCATION:${escapeIcsText(input.address)}`);
  }

  lines.push('END:VEVENT', 'END:VCALENDAR');

  return lines.join('\r\n') + '\r\n';
}
