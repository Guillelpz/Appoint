import type { DeferredTaskRunner } from '@/lib/email/types';

// Doble síncrono de DeferredTaskRunner para tests: ejecuta la tarea
// inmediatamente (en vez de diferirla con after()) para que las aserciones
// que siguen a un `await` sobre el servicio (p. ej. `emailSender.sent`) vean
// el efecto sin necesidad de un paso extra de "flush". Es un drop-in
// determinista, igual que FakeEmailSender lo es de EmailSender.
export class FakeDeferredTaskRunner implements DeferredTaskRunner {
  run(task: () => Promise<unknown> | void): void {
    // Hoy ninguna tarea puede rechazar (todos los envíos pasan por trySend,
    // que captura), pero un `void task()` a secas convertiría cualquier
    // rechazo futuro en un unhandled rejection que tumbaría la suite lejos
    // de su origen. after() tampoco propaga el fallo a quien llamó a run().
    // La tarea se sigue arrancando de forma síncrona (solo el manejo del
    // fallo es diferido), así que el momento en que se observan sus efectos
    // no cambia respecto a la versión anterior.
    try {
      void Promise.resolve(task()).catch((error) => {
        console.error('[FakeDeferredTaskRunner] la tarea diferida falló', error);
      });
    } catch (error) {
      console.error('[FakeDeferredTaskRunner] la tarea diferida falló', error);
    }
  }
}

// Variante que NO ejecuta las tareas al recibirlas: las guarda para que el
// test decida cuándo dispararlas con flush(). Sirve para demostrar que el
// servicio ya ha devuelto su resultado (p. ej. la cita creada) antes de que
// el email se haya enviado, que es justamente el comportamiento que se
// espera de after(): la respuesta no espera al email.
export class RecordingDeferredTaskRunner implements DeferredTaskRunner {
  pending: Array<() => Promise<unknown> | void> = [];

  run(task: () => Promise<unknown> | void): void {
    this.pending.push(task);
  }

  async flush(): Promise<void> {
    const tasks = this.pending;
    this.pending = [];
    for (const task of tasks) {
      await task();
    }
  }
}
