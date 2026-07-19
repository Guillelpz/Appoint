import type { Business, PrismaClient, ThemePreset } from '@prisma/client';

export interface BusinessSettingsInput {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  themePreset: ThemePreset;
  accentColor: string;
  maxBookingWindowDays: number;
  minAdvanceNoticeMinutes: number;
  cancellationPolicy: string | null;
  manualApproval: boolean;
  slotGranularityMinutes: number;
}

export type UpdateBusinessSettingsResult = { ok: true; business: Business } | { ok: false; reason: 'INVALID_INPUT' };

const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;
const VALID_GRANULARITIES = [5, 10, 15, 20, 30, 60];

export async function getBusinessSettings(prisma: PrismaClient, businessId: string): Promise<Business | null> {
  return prisma.business.findUnique({ where: { id: businessId } });
}

export async function updateBusinessSettings(
  prisma: PrismaClient,
  businessId: string,
  input: BusinessSettingsInput
): Promise<UpdateBusinessSettingsResult> {
  const name = input.name.trim();
  if (name.length === 0 || name.length > 120) {
    return { ok: false, reason: 'INVALID_INPUT' };
  }
  if (!HEX_COLOR_PATTERN.test(input.accentColor)) {
    return { ok: false, reason: 'INVALID_INPUT' };
  }
  if (!Number.isInteger(input.maxBookingWindowDays) || input.maxBookingWindowDays < 1 || input.maxBookingWindowDays > 365) {
    return { ok: false, reason: 'INVALID_INPUT' };
  }
  if (!Number.isInteger(input.minAdvanceNoticeMinutes) || input.minAdvanceNoticeMinutes < 0 || input.minAdvanceNoticeMinutes > 10080) {
    return { ok: false, reason: 'INVALID_INPUT' };
  }
  if (!VALID_GRANULARITIES.includes(input.slotGranularityMinutes)) {
    return { ok: false, reason: 'INVALID_INPUT' };
  }

  const business = await prisma.business.update({
    where: { id: businessId },
    data: {
      name,
      address: input.address?.trim() || null,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      themePreset: input.themePreset,
      accentColor: input.accentColor,
      maxBookingWindowDays: input.maxBookingWindowDays,
      minAdvanceNoticeMinutes: input.minAdvanceNoticeMinutes,
      cancellationPolicy: input.cancellationPolicy?.trim() || null,
      manualApproval: input.manualApproval,
      slotGranularityMinutes: input.slotGranularityMinutes,
    },
  });

  return { ok: true, business };
}
