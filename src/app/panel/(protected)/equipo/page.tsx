import Link from 'next/link';
import { requirePanelSession } from '@/lib/panel/session';
import { prisma } from '@/lib/db';
import { listEmployeesForBusiness } from '@/lib/panel/employees-service';
import { listServicesForBusiness } from '@/lib/panel/services-service';
import { CreateEmployeeForm } from './CreateEmployeeForm';

export default async function EquipoPage() {
  const { businessId } = await requirePanelSession();
  const employees = await listEmployeesForBusiness(prisma, businessId);
  const services = await listServicesForBusiness(prisma, businessId);
  const activeServices = services.filter((service) => service.active);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Equipo</h1>

      <ul className="space-y-2">
        {employees.map((employee) => (
          <li key={employee.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: employee.color }} />
              <Link href={`/panel/equipo/${employee.id}`} className="font-medium text-slate-900 underline">
                {employee.name}
              </Link>
              {!employee.active && <span className="text-xs text-slate-400">(inactivo)</span>}
            </div>
            <span className="text-sm text-slate-500">{employee.services.length} servicios</span>
          </li>
        ))}
        {employees.length === 0 && <p className="text-sm text-slate-400">Todavía no hay empleados.</p>}
      </ul>

      <CreateEmployeeForm services={activeServices} />
    </div>
  );
}
