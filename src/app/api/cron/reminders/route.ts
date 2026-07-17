import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sendDueReminders } from '@/lib/email/reminders';
import { isAuthorizedCronRequest } from '@/lib/email/cron-auth';

export async function GET(request: Request): Promise<Response> {
  const authorized = isAuthorizedCronRequest(request.headers.get('authorization'), process.env.CRON_SECRET);
  if (!authorized) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const result = await sendDueReminders(prisma);
    return NextResponse.json({ sent: result.sent });
  } catch (error) {
    console.error('[cron/reminders]', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
