'use client';

export interface StepSuccessProps {
  pendingApproval: boolean;
  onClose: () => void;
}

export function StepSuccess({ pendingApproval, onClose }: StepSuccessProps) {
  return (
    <div className="py-6 text-center">
      <p className="mb-2 font-[family-name:var(--font-heading)] text-xl font-semibold text-[var(--color-text)]">
        {pendingApproval ? 'Solicitud enviada' : '¡Reserva realizada!'}
      </p>
      <p className="mb-6 text-sm text-[var(--color-text-muted)]">
        {pendingApproval
          ? 'Te hemos enviado un email para confirmar tu dirección. Una vez la confirmes, el negocio revisará tu solicitud y te avisaremos por email en cuanto la apruebe.'
          : 'Te hemos enviado un email para confirmar tu cita. Tienes 30 minutos para confirmarla o el hueco se liberará.'}
      </p>
      <button
        type="button"
        onClick={onClose}
        className="rounded-[var(--radius-theme)] bg-[var(--color-accent)] px-6 py-3 font-semibold text-[var(--color-accent-contrast)]"
      >
        Entendido
      </button>
    </div>
  );
}
