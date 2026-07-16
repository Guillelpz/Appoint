'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { cancelPublicAppointment } from '@/lib/public/cancellation-service';

export async function cancelAppointmentAction(token: string): Promise<void> {
  await cancelPublicAppointment(prisma, { token });
  revalidatePath(`/cita/${token}`);
}
