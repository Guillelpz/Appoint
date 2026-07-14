'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { BookingSheet } from './booking-sheet/BookingSheet';
import type { StepEmployeeOption } from './booking-sheet/StepEmployee';

interface BookingLauncherContextValue {
  openService: (serviceId: string) => void;
}

const BookingLauncherContext = createContext<BookingLauncherContextValue | null>(null);

export function useBookingLauncher(): BookingLauncherContextValue {
  const ctx = useContext(BookingLauncherContext);
  if (!ctx) {
    throw new Error('useBookingLauncher debe usarse dentro de <BookingLauncherProvider>');
  }
  return ctx;
}

export interface BookingLauncherService {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents: number;
}

export interface BookingLauncherProviderProps {
  slug: string;
  services: BookingLauncherService[];
  employees: StepEmployeeOption[];
  maxBookingWindowDays: number;
  children: ReactNode;
}

export function BookingLauncherProvider({
  slug,
  services,
  employees,
  maxBookingWindowDays,
  children,
}: BookingLauncherProviderProps) {
  const [openServiceId, setOpenServiceId] = useState<string | null>(null);
  const activeService = services.find((s) => s.id === openServiceId) ?? null;

  return (
    <BookingLauncherContext.Provider value={{ openService: setOpenServiceId }}>
      {children}
      {activeService && (
        <BookingSheet
          slug={slug}
          service={activeService}
          employees={employees}
          maxBookingWindowDays={maxBookingWindowDays}
          onClose={() => setOpenServiceId(null)}
        />
      )}
    </BookingLauncherContext.Provider>
  );
}
