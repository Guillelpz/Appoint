import { requireAdminSession } from '@/lib/admin/session';
import { prisma } from '@/lib/db';
import { getPlatformMetrics } from '@/lib/admin/platform-metrics-service';

export default async function AdminDashboardPage() {
  await requireAdminSession();
  const metrics = await getPlatformMetrics(prisma, new Date());

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Panel de super-administración</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Negocios activos</p>
          <p className="text-3xl font-semibold text-slate-900">{metrics.activeBusinessCount}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Citas de esta semana</p>
          <p className="text-3xl font-semibold text-slate-900">{metrics.appointmentsThisWeekCount}</p>
        </div>
      </div>
    </div>
  );
}
