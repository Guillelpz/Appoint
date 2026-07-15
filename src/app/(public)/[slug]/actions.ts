'use server';

import { headers } from 'next/headers';
import { prisma } from '@/lib/db';
import { getAvailableSlotsForBusiness, getDedupedAvailableSlotsForBusiness } from '@/lib/public/slots-service';
import { bookAppointmentBySlug } from '@/lib/public/booking-service';

export interface FetchSlotsActionInput {
  slug: string;
  serviceId: string;
  employeeId?: string;
  dateFrom: string;
  dateTo: string;
}

export interface SlotOption {
  start: string;
  end: string;
  employeeIds: string[];
}

export async function fetchAvailableSlotsAction(input: FetchSlotsActionInput): Promise<SlotOption[]> {
  if (input.employeeId) {
    const slots = await getAvailableSlotsForBusiness(prisma, input);
    return slots.map((s) => ({ start: s.start.toISOString(), end: s.end.toISOString(), employeeIds: [s.employeeId] }));
  }

  const slots = await getDedupedAvailableSlotsForBusiness(prisma, input);
  return slots.map((s) => ({ start: s.start.toISOString(), end: s.end.toISOString(), employeeIds: s.employeeIds }));
}

export interface BookAppointmentActionInput {
  slug: string;
  serviceId: string;
  employeeId?: string;
  start: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
}

export interface BookAppointmentActionResult {
  ok: boolean;
  confirmToken?: string;
  cancelToken?: string;
  pendingApproval?: boolean;
  message?: string;
  alternativeSlots?: string[];
}

export async function bookAppointmentAction(input: BookAppointmentActionInput): Promise<BookAppointmentActionResult> {
  const requestHeaders = await headers();
  const ipAddress = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1';

  const result = await bookAppointmentBySlug(prisma, {
    slug: input.slug,
    serviceId: input.serviceId,
    employeeId: input.employeeId,
    start: new Date(input.start),
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    customerEmail: input.customerEmail,
    ipAddress,
  });

  if (result.ok) {
    return {
      ok: true,
      confirmToken: result.confirmToken,
      cancelToken: result.cancelToken,
      pendingApproval: result.pendingApproval,
    };
  }

  return { ok: false, message: result.message, alternativeSlots: result.alternativeSlots.map((d) => d.toISOString()) };
}
