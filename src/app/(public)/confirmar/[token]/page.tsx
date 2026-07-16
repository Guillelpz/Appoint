import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { isPendingAppointmentExpired } from '@/lib/booking/tokens';
import { getAppointmentByConfirmToken, type PublicAppointmentSummary } from '@/lib/public/appointment-lookup';
import { getPublicBusinessBySlug, type PublicBusiness } from '@/lib/public/business-lookup';
import { getThemeCssVariables } from '@/lib/theme/theme';
import { formatAppointmentDateTime } from '@/lib/public/format-datetime';
import { generateAppointmentIcs } from '@/lib/public/ics';
import { confirmAppointmentAction } from './actions';

function ThemedScreen({
  business,
  title,
  children,
}: {
  business: PublicBusiness;
  title: string;
  children?: ReactNode;
}) {
  const theme = getThemeCssVariables(business);
  return (
    <main
      style={{ ...theme, fontFamily: 'var(--font-body, var(--font-lora))' } as CSSProperties}
      className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 bg-[var(--color-bg,#FAF6F0)] px-6 py-12 text-center text-[var(--color-text,#2B211B)]"
    >
      <h1 className="font-[family-name:var(--font-heading,serif)] text-2xl font-semibold">{title}</h1>
      {children}
    </main>
  );
}

function renderSummaryCard(summary: PublicAppointmentSummary) {
  return (
    <div className="w-full rounded-[var(--radius-theme,0.5rem)] bg-[var(--color-surface,#fff)] p-6 shadow-[var(--shadow-theme,none)]">
      <p className="font-semibold">{summary.serviceName}</p>
      <p className="text-sm text-[var(--color-text-muted,#666)]">{formatAppointmentDateTime(summary.start)}</p>
      <p className="text-sm text-[var(--color-text-muted,#666)]">
        Con {summary.employeeName} · {summary.businessName}
      </p>
    </div>
  );
}

function renderSuccess(summary: PublicAppointmentSummary, business: PublicBusiness) {
  const icsDataUrl = `data:text/calendar;charset=utf-8,${encodeURIComponent(
    generateAppointmentIcs({
      uid: `${summary.id}@appoint.app`,
      businessName: summary.businessName,
      serviceName: summary.serviceName,
      employeeName: summary.employeeName,
      address: business.address,
      start: summary.start,
      end: summary.end,
    })
  )}`;

  return (
    <ThemedScreen business={business} title="¡Cita confirmada!">
      {renderSummaryCard(summary)}

      <a
        href={icsDataUrl}
        download="cita.ics"
        className="rounded-[var(--radius-theme,0.5rem)] bg-[var(--color-accent,#B25539)] px-4 py-2 text-sm font-semibold text-[var(--color-accent-contrast,#fff)]"
      >
        Añadir a mi calendario
      </a>

      <Link href={`/cita/${summary.cancelToken}`} className="text-sm underline text-[var(--color-accent,#B25539)]">
        Ver o cancelar mi cita
      </Link>
    </ThemedScreen>
  );
}

export default async function ConfirmarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const summary = await getAppointmentByConfirmToken(prisma, token);

  if (!summary) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 bg-[#FAF6F0] px-6 py-12 text-center text-[#2B211B]">
        <h1 className="text-2xl font-semibold">No hemos podido confirmar tu cita</h1>
        <p className="text-[#6B5D53]">No encontramos ninguna cita con este enlace. Puede que el enlace no sea correcto.</p>
      </main>
    );
  }

  const business = await getPublicBusinessBySlug(prisma, summary.businessSlug);
  if (!business) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 bg-[#FAF6F0] px-6 py-12 text-center text-[#2B211B]">
        <h1 className="text-2xl font-semibold">No hemos podido confirmar tu cita</h1>
        <p className="text-[#6B5D53]">Este negocio ya no está disponible.</p>
      </main>
    );
  }

  if (summary.status === 'CONFIRMED') {
    return renderSuccess(summary, business);
  }

  if (summary.status === 'CANCELLED') {
    return (
      <ThemedScreen business={business} title="Esta cita ha sido cancelada">
        {renderSummaryCard(summary)}
      </ThemedScreen>
    );
  }

  if (summary.status === 'COMPLETED' || summary.status === 'NO_SHOW') {
    return (
      <ThemedScreen business={business} title="Esta cita ya no está pendiente de confirmación">
        {renderSummaryCard(summary)}
      </ThemedScreen>
    );
  }

  // status === 'PENDING' a partir de aquí.
  if (summary.emailVerifiedAt) {
    // Solo ocurre con manualApproval: el cliente ya confirmó su email, pero
    // el negocio aún no ha aprobado la cita (panel de aprobación: Fase 5).
    return (
      <ThemedScreen business={business} title="Ya has confirmado tu email">
        {renderSummaryCard(summary)}
        <p className="text-sm text-[var(--color-text-muted,#666)]">
          Tu cita está pendiente de aprobación por parte del negocio. Te avisaremos por email en cuanto la confirmen.
        </p>
      </ThemedScreen>
    );
  }

  if (isPendingAppointmentExpired(summary, new Date())) {
    return (
      <ThemedScreen business={business} title="El enlace de confirmación ha caducado">
        {renderSummaryCard(summary)}
        <p className="text-sm text-[var(--color-text-muted,#666)]">
          Han pasado más de 30 minutos desde la reserva y el hueco ya se ha liberado. Puedes volver a reservar desde
          la página del negocio.
        </p>
      </ThemedScreen>
    );
  }

  return (
    <ThemedScreen business={business} title="Confirma tu cita">
      {renderSummaryCard(summary)}
      <form action={confirmAppointmentAction.bind(null, token)}>
        <button
          type="submit"
          className="rounded-[var(--radius-theme,0.5rem)] bg-[var(--color-accent,#B25539)] px-6 py-3 font-semibold text-[var(--color-accent-contrast,#fff)]"
        >
          Confirmar cita
        </button>
      </form>
    </ThemedScreen>
  );
}
