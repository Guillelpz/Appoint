'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import type { StepEmployeeOption } from './booking-sheet/StepEmployee';

// Carga bajo demanda: GSAP y @gsap/react (importados por BookingSheet) solo
// entran en el bundle cuando el visitante pulsa "Reservar", no en cada carga
// de la página pública. `ssr: false` porque la hoja es un overlay interactivo
// sin sentido en el HTML inicial; su propia animación de apertura (useGSAP)
// corre igual al montarse tras cargar el chunk.
const BookingSheet = dynamic(() => import('./booking-sheet/BookingSheet').then((mod) => mod.BookingSheet), {
  ssr: false,
});

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
