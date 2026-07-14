import type { CSSProperties } from 'react';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { confirmAppointment } from '@/lib/booking/tokens';
import { getConfirmErrorMessage } from '@/lib/public/error-messages';
import { getAppointmentByConfirmToken } from '@/lib/public/appointment-lookup';
import { getPublicBusinessBySlug } from '@/lib/public/business-lookup';
import { getThemeCssVariables } from '@/lib/theme/theme';
import { formatAppointmentDateTime } from '@/lib/public/format-datetime';
import { generateAppointmentIcs } from '@/lib/public/ics';

export default async function ConfirmarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await confirmAppointment(prisma, token);

  if (!result.ok) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 bg-[#FAF6F0] px-6 py-12 text-center text-[#2B211B]">
        <h1 className="text-2xl font-semibold">No hemos podido confirmar tu cita</h1>
        <p className="text-[#6B5D53]">{getConfirmErrorMessage(result.reason)}</p>
      </main>
    );
  }

  const summary = await getAppointmentByConfirmToken(prisma, token);
  const business = summary ? await getPublicBusinessBySlug(prisma, summary.businessSlug) : null;
  const theme = business ? getThemeCssVariables(business) : {};

  const icsDataUrl = summary
    ? `data:text/calendar;charset=utf-8,${encodeURIComponent(
        generateAppointmentIcs({
          uid: `${summary.id}@appoint.app`,
          businessName: summary.businessName,
          serviceName: summary.serviceName,
          employeeName: summary.employeeName,
          address: business?.address ?? null,
          start: summary.start,
          end: summary.end,
        })
      )}`
    : null;

  return (
    <main
      style={{ ...theme, fontFamily: 'var(--font-body, var(--font-lora))' } as CSSProperties}
      className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 bg-[var(--color-bg,#FAF6F0)] px-6 py-12 text-center text-[var(--color-text,#2B211B)]"
    >
      <h1 className="font-[family-name:var(--font-heading,serif)] text-2xl font-semibold">¡Cita confirmada!</h1>

      {summary && (
        <div className="w-full rounded-[var(--radius-theme,0.5rem)] bg-[var(--color-surface,#fff)] p-6 shadow-[var(--shadow-theme,none)]">
          <p className="font-semibold">{summary.serviceName}</p>
          <p className="text-sm text-[var(--color-text-muted,#666)]">{formatAppointmentDateTime(summary.start)}</p>
          <p className="text-sm text-[var(--color-text-muted,#666)]">
            Con {summary.employeeName} · {summary.businessName}
          </p>
        </div>
      )}

      {icsDataUrl && (
        <a
          href={icsDataUrl}
          download="cita.ics"
          className="rounded-[var(--radius-theme,0.5rem)] bg-[var(--color-accent,#B25539)] px-4 py-2 text-sm font-semibold text-[var(--color-accent-contrast,#fff)]"
        >
          Añadir a mi calendario
        </a>
      )}

      {summary && (
        <Link href={`/cita/${summary.cancelToken}`} className="text-sm underline text-[var(--color-accent,#B25539)]">
          Ver o cancelar mi cita
        </Link>
      )}
    </main>
  );
}
