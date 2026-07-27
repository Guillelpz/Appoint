import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePanelSession } from '@/lib/panel/session';
import { prisma } from '@/lib/db';
import { getEmployeeForBusiness } from '@/lib/panel/employees-service';
import { listServicesForBusiness } from '@/lib/panel/services-service';
import { formatAppointmentDateTime } from '@/lib/public/format-datetime';
import { WorkingHoursEditor } from './WorkingHoursEditor';
import { EditEmployeeForm } from './EditEmployeeForm';
import { createTimeOffAction, deleteTimeOffAction } from './actions';

const AVISO_MESSAGES: Record<string, string> = {
  'accion-no-aplicada': 'Esa acción ya no se puede aplicar: el empleado o la ausencia cambiaron mientras tanto. La página se ha actualizado.',
  'ausencia-invalida': 'Revisa las fechas de la ausencia: el fin debe ser posterior al inicio.',
  'ausencia-en-el-pasado': 'La ausencia no puede empezar antes de hoy.',
  'ausencia-demasiado-larga': 'Una ausencia no puede durar más de 90 días. Divídela en varias si hace falta.',
  'ausencia-demasiado-lejana': 'No se pueden crear ausencias con más de 2 años de antelación.',
  'ausencia-solapada': 'Ese empleado ya tiene otra ausencia que se solapa con esas fechas.',
};

export default async function EmployeeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aviso?: string }>;
}) {
  const { businessId } = await requirePanelSession();
  const { id } = await params;
  const { aviso } = await searchParams;
  const employee = await getEmployeeForBusiness(prisma, businessId, id);

  if (!employee) {
    notFound();
  }

  const services = await listServicesForBusiness(prisma, businessId);
  const activeServices = services.filter((service) => service.active);
  const employeeServiceIds = employee.services.map((s) => s.serviceId);

  const avisoMessage = aviso ? AVISO_MESSAGES[aviso] : undefined;

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold text-slate-900">{employee.name}</h1>

      {avisoMessage && (
        <div className="flex items-center justify-between gap-3 rounded border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          <span>{avisoMessage}</span>
          <Link href={`/panel/equipo/${employee.id}`} className="font-medium underline shrink-0">
            Cerrar
          </Link>
        </div>
      )}

      <section>
        <h2 className="mb-2 font-semibold text-slate-900">Datos</h2>
        <EditEmployeeForm employee={employee} services={activeServices} initialServiceIds={employeeServiceIds} />
      </section>

      <section>
        <h2 className="mb-2 font-semibold text-slate-900">Horario semanal</h2>
        <WorkingHoursEditor
          employeeId={employee.id}
          initialBlocks={employee.workingHours.map((wh) => ({ weekday: wh.weekday, startMinute: wh.startMinute, endMinute: wh.endMinute }))}
        />
      </section>

      <section>
        <h2 className="mb-2 font-semibold text-slate-900">Ausencias</h2>
        <ul className="mb-3 space-y-2">
          {employee.timeOff.map((t) => (
            <li key={t.id} className="flex items-center justify-between rounded border border-slate-200 p-2 text-sm">
              <span>
                {formatAppointmentDateTime(t.start)} → {formatAppointmentDateTime(t.end)}
                {t.reason ? ` · ${t.reason}` : ''}
              </span>
              <form action={deleteTimeOffAction.bind(null, employee.id, t.id)}>
                <button type="submit" className="text-xs text-red-600 underline">
                  Eliminar
                </button>
              </form>
            </li>
          ))}
          {employee.timeOff.length === 0 && <p className="text-sm text-slate-400">Sin ausencias.</p>}
        </ul>

        <form action={createTimeOffAction.bind(null, employee.id)} className="flex flex-wrap items-end gap-2 text-sm">
          <label>
            Desde
            <input type="datetime-local" name="start" required className="mt-1 block rounded border border-slate-300 px-2 py-1" />
          </label>
          <label>
            Hasta
            <input type="datetime-local" name="end" required className="mt-1 block rounded border border-slate-300 px-2 py-1" />
          </label>
          <label>
            Motivo
            <input type="text" name="reason" className="mt-1 block rounded border border-slate-300 px-2 py-1" />
          </label>
          <button type="submit" className="rounded bg-slate-900 px-3 py-1.5 text-white">
            Añadir ausencia
          </button>
        </form>
      </section>
    </div>
  );
}
