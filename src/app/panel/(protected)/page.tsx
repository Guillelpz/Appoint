import Link from 'next/link';
import { requirePanelSession } from '@/lib/panel/session';
import { prisma } from '@/lib/db';
import { getAgendaForBusiness } from '@/lib/panel/agenda-service';
import { getLocalDateString, addDaysToLocalDateString, localMinutesToUtc } from '@/lib/booking/timezone';
import { formatSlotTime } from '@/lib/public/format-datetime';
import {
  approveAppointmentAction,
  rejectAppointmentAction,
  completeAppointmentAction,
  markNoShowAppointmentAction,
  cancelAppointmentFromPanelAction,
} from './actions';
import { ManualAppointmentForm } from './ManualAppointmentForm';

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente',
  CONFIRMED: 'Confirmada',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
  NO_SHOW: 'No presentado',
};

export default async function PanelAgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; view?: string }>;
}) {
  const { businessId } = await requirePanelSession();
  const { date, view } = await searchParams;

  const selectedDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : getLocalDateString(new Date());
  const isWeek = view === 'week';
  const rangeEndExclusive = addDaysToLocalDateString(selectedDate, isWeek ? 7 : 1);

  const agenda = await getAgendaForBusiness(prisma, {
    businessId,
    dateFromUtc: localMinutesToUtc(selectedDate, 0),
    dateToUtc: localMinutesToUtc(rangeEndExclusive, 0),
  });

  const services = await prisma.service.findMany({ where: { businessId, active: true }, orderBy: { name: 'asc' } });
  const employeesForForm = await prisma.employee.findMany({
    where: { businessId, active: true },
    include: { services: true },
    orderBy: { name: 'asc' },
  });

  const previousDate = addDaysToLocalDateString(selectedDate, isWeek ? -7 : -1);
  const nextDate = addDaysToLocalDateString(selectedDate, isWeek ? 7 : 1);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Agenda</h1>
        <div className="flex items-center gap-2 text-sm">
          <Link href={`/panel?date=${previousDate}&view=${isWeek ? 'week' : 'day'}`} className="rounded border border-slate-300 px-3 py-1.5 hover:bg-slate-100">
            ← Anterior
          </Link>
          <span className="font-medium text-slate-700">{selectedDate}</span>
          <Link href={`/panel?date=${nextDate}&view=${isWeek ? 'week' : 'day'}`} className="rounded border border-slate-300 px-3 py-1.5 hover:bg-slate-100">
            Siguiente →
          </Link>
          <Link href={`/panel?date=${selectedDate}&view=day`} className={`rounded px-3 py-1.5 ${!isWeek ? 'bg-slate-900 text-white' : 'border border-slate-300'}`}>
            Día
          </Link>
          <Link href={`/panel?date=${selectedDate}&view=week`} className={`rounded px-3 py-1.5 ${isWeek ? 'bg-slate-900 text-white' : 'border border-slate-300'}`}>
            Semana
          </Link>
        </div>
      </div>

      <ManualAppointmentForm
        services={services.map((s) => ({ id: s.id, name: s.name }))}
        employees={employeesForForm.map((e) => ({ id: e.id, name: e.name, serviceIds: e.services.map((se) => se.serviceId) }))}
        defaultDate={selectedDate}
      />

      {agenda.employees.length === 0 && <p className="text-sm text-slate-500">Todavía no hay empleados activos. Añádelos en Equipo.</p>}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {agenda.employees.map((employee) => {
          const employeeAppointments = agenda.appointments.filter((a) => a.employeeId === employee.id);
          return (
            <div key={employee.id} className="rounded-lg border border-slate-200 bg-white p-4">
              <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
                <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: employee.color }} />
                {employee.name}
              </h2>
              {employeeAppointments.length === 0 && <p className="text-sm text-slate-400">Sin citas.</p>}
              <ul className="space-y-2">
                {employeeAppointments.map((appt) => (
                  <li key={appt.id} className="rounded border border-slate-200 p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-900">
                        {formatSlotTime(appt.start)} · {appt.serviceName}
                      </span>
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${
                          appt.status === 'CANCELLED'
                            ? 'bg-red-100 text-red-700'
                            : appt.manualApprovalPending
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {appt.manualApprovalPending ? 'Pendiente de aprobación' : STATUS_LABELS[appt.status]}
                      </span>
                    </div>
                    <p className="text-slate-500">
                      {appt.customerName}
                      {appt.customerPhone ? ` · ${appt.customerPhone}` : ''}
                    </p>

                    <div className="mt-2 flex flex-wrap gap-2">
                      {appt.manualApprovalPending && (
                        <>
                          <form action={approveAppointmentAction.bind(null, appt.id)}>
                            <button type="submit" className="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white">
                              Aprobar
                            </button>
                          </form>
                          <form action={rejectAppointmentAction.bind(null, appt.id)}>
                            <button type="submit" className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white">
                              Rechazar
                            </button>
                          </form>
                        </>
                      )}
                      {appt.status === 'CONFIRMED' && (
                        <>
                          <form action={completeAppointmentAction.bind(null, appt.id)}>
                            <button type="submit" className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700">
                              Completada
                            </button>
                          </form>
                          <form action={markNoShowAppointmentAction.bind(null, appt.id)}>
                            <button type="submit" className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700">
                              No presentado
                            </button>
                          </form>
                          <form action={cancelAppointmentFromPanelAction.bind(null, appt.id)}>
                            <button type="submit" className="rounded border border-red-300 px-2 py-1 text-xs font-medium text-red-700">
                              Cancelar
                            </button>
                          </form>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
