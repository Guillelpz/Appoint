import { notFound } from 'next/navigation';
import { requirePanelSession } from '@/lib/panel/session';
import { prisma } from '@/lib/db';
import { EditServiceForm } from './EditServiceForm';

export default async function ServiceEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { businessId } = await requirePanelSession();
  const { id } = await params;
  const service = await prisma.service.findUnique({ where: { id } });

  if (!service || service.businessId !== businessId) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Editar servicio</h1>
      <EditServiceForm service={service} />
    </div>
  );
}
