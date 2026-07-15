import type { CSSProperties } from 'react';
import { prisma } from '@/lib/db';
import { getAppointmentByCancelToken } from '@/lib/public/appointment-lookup';
import { getPublicBusinessBySlug } from '@/lib/public/business-lookup';
import { getThemeCssVariables } from '@/lib/theme/theme';
import { formatAppointmentDateTime } from '@/lib/public/format-datetime';
import { cancelAppointmentAction } from './actions';

const STATUS_MESSAGES: Record<string, string> = {
  PENDING: 'Tu cita está pendiente de confirmación.',
  CONFIRMED: 'Tu cita está confirmada.',
  CANCELLED: 'Esta cita está cancelada.',
  COMPLETED: 'Esta cita ya se completó.',
  NO_SHOW: 'Esta cita se marcó como no presentada.',
};

export default async function CitaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const summary = await getAppointmentByCancelToken(prisma, token);

  if (!summary) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 bg-[#FAF6F0] px-6 py-12 text-center text-[#2B211B]">
        <h1 className="text-2xl font-semibold">No encontramos esta cita</h1>
        <p className="text-[#6B5D53]">Puede que el enlace no sea correcto o que la cita ya no exista.</p>
      </main>
    );
  }

  const business = await getPublicBusinessBySlug(prisma, summary.businessSlug);
  const theme = business ? getThemeCssVariables(business) : {};
  const canCancel = summary.status === 'PENDING' || summary.status === 'CONFIRMED';

  return (
    <main
      style={{ ...theme, fontFamily: 'var(--font-body, var(--font-lora))' } as CSSProperties}
      className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 bg-[var(--color-bg,#FAF6F0)] px-6 py-12 text-center text-[var(--color-text,#2B211B)]"
    >
      <h1 className="font-[family-name:var(--font-heading,serif)] text-2xl font-semibold">Tu cita</h1>

      <div className="w-full rounded-[var(--radius-theme,0.5rem)] bg-[var(--color-surface,#fff)] p-6 shadow-[var(--shadow-theme,none)]">
        <p className="font-semibold">{summary.serviceName}</p>
        <p className="text-sm text-[var(--color-text-muted,#666)]">{formatAppointmentDateTime(summary.start)}</p>
        <p className="text-sm text-[var(--color-text-muted,#666)]">
          Con {summary.employeeName} · {summary.businessName}
        </p>
        <p className="mt-3 text-sm font-medium text-[var(--color-text)]">{STATUS_MESSAGES[summary.status]}</p>
      </div>

      {canCancel && (
        <form action={cancelAppointmentAction.bind(null, token)}>
          <button
            type="submit"
            className="rounded-[var(--radius-theme,0.5rem)] border border-[var(--color-accent,#B25539)] px-6 py-3 font-semibold text-[var(--color-accent,#B25539)]"
          >
            Cancelar cita
          </button>
        </form>
      )}
    </main>
  );
}
