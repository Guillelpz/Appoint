'use client';

import { useFormStatus } from 'react-dom';

interface SubmitButtonProps {
  children: React.ReactNode;
  // Texto mientras la Server Action está en vuelo. Si no se indica, se
  // mantiene el texto normal y solo se deshabilita el botón.
  pendingLabel?: string;
  className?: string;
}

// Botón de envío con feedback de carga para los `<form action={serverAction}>`
// renderizados en Server Components: `useFormStatus` lee el estado del form
// padre, así que basta con sustituir el `<button type="submit">` por este
// componente sin convertir la página entera en cliente.
export function SubmitButton({ children, pendingLabel, className }: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={className}>
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
