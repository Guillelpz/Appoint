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

const ICS_MAX_LINE_OCTETS = 75;
const icsEncoder = new TextEncoder();

function foldIcsLine(line: string): string {
  if (icsEncoder.encode(line).length <= ICS_MAX_LINE_OCTETS) {
    return line;
  }

  const folded: string[] = [];
  let current = '';
  let currentOctets = 0;

  // Iterar por code points evita partir un carácter UTF-8 multibyte por la mitad.
  for (const char of line) {
    const charOctets = icsEncoder.encode(char).length;
    if (currentOctets + charOctets > ICS_MAX_LINE_OCTETS) {
      folded.push(current);
      current = ' ';
      currentOctets = 1;
    }
    current += char;
    currentOctets += charOctets;
  }

  folded.push(current);
  return folded.join('\r\n');
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

  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}
