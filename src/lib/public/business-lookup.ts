import type { PrismaClient, ThemePreset } from '@prisma/client';

export interface PublicBusinessService {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceCents: number;
}

export interface PublicBusinessEmployee {
  id: string;
  name: string;
  photoUrl: string | null;
  color: string;
}

export interface PublicBusiness {
  id: string;
  slug: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  themePreset: ThemePreset;
  accentColor: string;
  logoUrl: string | null;
  manualApproval: boolean;
  maxBookingWindowDays: number;
  services: PublicBusinessService[];
  employees: PublicBusinessEmployee[];
}

export async function getPublicBusinessBySlug(prisma: PrismaClient, slug: string): Promise<PublicBusiness | null> {
  const business = await prisma.business.findUnique({
    where: { slug },
    include: {
      services: { where: { active: true }, orderBy: { sortOrder: 'asc' } },
      employees: { where: { active: true }, orderBy: { name: 'asc' } },
    },
  });

  if (!business || !business.active) {
    return null;
  }

  return {
    id: business.id,
    slug: business.slug,
    name: business.name,
    address: business.address,
    phone: business.phone,
    email: business.email,
    themePreset: business.themePreset,
    accentColor: business.accentColor,
    logoUrl: business.logoUrl,
    manualApproval: business.manualApproval,
    maxBookingWindowDays: business.maxBookingWindowDays,
    services: business.services.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      durationMinutes: s.durationMinutes,
      priceCents: s.priceCents,
    })),
    employees: business.employees.map((e) => ({
      id: e.id,
      name: e.name,
      photoUrl: e.photoUrl,
      color: e.color,
    })),
  };
}
