import type { ReactElement } from 'react';

export interface EmailMessage {
  to: string;
  subject: string;
  react: ReactElement;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

// Abstrae "ejecutar esto después de responder al usuario, garantizando que se
// ejecuta" — el mismo papel que EmailSender juega para el transporte de
// email, pero para el momento en que se dispara el envío. La implementación
// por defecto (getDeferredTaskRunner en get-email-sender.ts) usa after() de
// next/server; en tests se inyecta un Fake síncrono (src/test/fake-deferred-task-runner.ts)
// porque after() exige un contexto de petición de Next que Vitest no tiene.
export interface DeferredTaskRunner {
  run(task: () => Promise<unknown> | void): void;
}
