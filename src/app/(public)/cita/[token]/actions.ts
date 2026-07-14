'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { cancelAppointment } from '@/lib/booking/tokens';

export async function cancelAppointmentAction(token: string): Promise<void> {
  await cancelAppointment(prisma, token);
  revalidatePath(`/cita/${token}`);
}
