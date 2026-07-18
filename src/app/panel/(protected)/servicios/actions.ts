'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requirePanelSession } from '@/lib/panel/session';
import { createServiceForBusiness, updateServiceForBusiness, setServiceActive, type ServiceInput } from '@/lib/panel/services-service';

function readServiceInput(formData: FormData): ServiceInput {
  return {
    name: String(formData.get('name') ?? ''),
    description: String(formData.get('description') ?? '') || null,
    durationMinutes: Number(formData.get('durationMinutes')),
    priceCents: Number(formData.get('priceCents')),
    bufferAfterMinutes: Number(formData.get('bufferAfterMinutes') ?? 0),
    active: formData.get('active') === 'on',
    sortOrder: Number(formData.get('sortOrder') ?? 0),
  };
}

export async function createServiceAction(formData: FormData): Promise<void> {
  const { businessId } = await requirePanelSession();
  await createServiceForBusiness(prisma, businessId, readServiceInput(formData));
  revalidatePath('/panel/servicios');
}

export async function updateServiceAction(serviceId: string, formData: FormData): Promise<void> {
  const { businessId } = await requirePanelSession();
  await updateServiceForBusiness(prisma, businessId, serviceId, readServiceInput(formData));
  revalidatePath('/panel/servicios');
  redirect('/panel/servicios');
}

export async function setServiceActiveAction(serviceId: string, active: boolean): Promise<void> {
  const { businessId } = await requirePanelSession();
  await setServiceActive(prisma, businessId, serviceId, active);
  revalidatePath('/panel/servicios');
}
