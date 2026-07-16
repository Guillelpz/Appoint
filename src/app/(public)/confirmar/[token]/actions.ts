'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { confirmAppointment } from '@/lib/booking/tokens';

export async function confirmAppointmentAction(token: string): Promise<void> {
  await confirmAppointment(prisma, token);
  revalidatePath(`/confirmar/${token}`);
}
