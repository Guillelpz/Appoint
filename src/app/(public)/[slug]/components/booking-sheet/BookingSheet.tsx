'use client';

import { useReducer, useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { wizardReducer, createInitialWizardState } from '@/lib/public/wizard-state';
import { StepEmployee, type StepEmployeeOption } from './StepEmployee';

gsap.registerPlugin(useGSAP);

export interface BookingSheetService {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents: number;
}

export interface BookingSheetProps {
  slug: string;
  service: BookingSheetService;
  employees: StepEmployeeOption[];
  maxBookingWindowDays: number;
  onClose: () => void;
}

export function BookingSheet({ service, employees, onClose }: BookingSheetProps) {
  const [state, dispatch] = useReducer(wizardReducer, service.id, createInitialWizardState);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const { contextSafe } = useGSAP(
    () => {
      gsap.set(containerRef.current, { autoAlpha: 0 });
      gsap.set(panelRef.current, { yPercent: 100 });
      const tl = gsap.timeline();
      tl.to(containerRef.current, { autoAlpha: 1, duration: 0.2, ease: 'power1.out' });
      tl.to(panelRef.current, { yPercent: 0, duration: 0.4, ease: 'power3.out' }, '<');
    },
    { scope: containerRef }
  );

  const handleClose = contextSafe(() => {
    gsap
      .timeline({ onComplete: onClose })
      .to(panelRef.current, { yPercent: 100, duration: 0.3, ease: 'power2.in' })
      .to(containerRef.current, { autoAlpha: 0, duration: 0.2 }, '<');
  });

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          handleClose();
        }
      }}
    >
      <div
        ref={panelRef}
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-[var(--radius-theme)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-theme)]"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-[var(--color-text)]">
            {service.name}
          </h2>
          <button type="button" onClick={handleClose} aria-label="Cerrar" className="text-[var(--color-text-muted)]">
            ✕
          </button>
        </div>

        {state.step === 'EMPLOYEE' && (
          <StepEmployee employees={employees} onSelect={(employeeId) => dispatch({ type: 'SELECT_EMPLOYEE', employeeId })} />
        )}

        {state.step !== 'EMPLOYEE' && (
          <p className="py-8 text-center text-[var(--color-text-muted)]">
            Este paso se completa en la Tarea 11 del plan de implementación.
          </p>
        )}
      </div>
    </div>
  );
}
