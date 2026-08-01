import { after } from 'next/server';
import { ConsoleEmailSender } from './console-sender';
import { ResendEmailSender } from './resend-sender';
import type { DeferredTaskRunner, EmailSender } from './types';

export function getEmailSender(): EmailSender {
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) {
    return new ResendEmailSender(apiKey);
  }
  return new ConsoleEmailSender();
}

// Implementación por defecto de DeferredTaskRunner (ver types.ts): delega en
// after() de next/server, que Next ejecuta tras enviar la respuesta al
// cliente pero garantiza que la función serverless no termina antes de que
// la tarea corra (a diferencia de un simple "olvidar el await"). Solo
// funciona dentro de un contexto de petición (Server Action, Route Handler,
// Server Component) — los llamadores en tests deben inyectar
// FakeDeferredTaskRunner en su lugar.
export function getDeferredTaskRunner(): DeferredTaskRunner {
  return {
    run(task: () => Promise<unknown> | void): void {
      after(task);
    },
  };
}
