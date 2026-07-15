import type { CreateAppointmentFailureReason } from '@/lib/booking/create-appointment';
import type { ConfirmAppointmentFailureReason, CancelAppointmentFailureReason } from '@/lib/booking/tokens';

export const INVALID_INPUT_MESSAGE =
  'Revisa tus datos: necesitamos tu nombre y un teléfono y un email válidos para reservar.';

export function getBookingErrorMessage(reason: CreateAppointmentFailureReason): string {
  switch (reason) {
    case 'RATE_LIMITED':
      return 'Has hecho demasiados intentos de reserva en poco tiempo. Espera unos minutos y vuelve a intentarlo.';
    case 'BLACKLISTED':
      return 'No podemos completar tu reserva en este negocio. Si crees que es un error, contacta directamente con ellos.';
    case 'CUSTOMER_LIMIT_REACHED':
      return 'Ya tienes el máximo de citas activas permitidas en este negocio. Cancela alguna antes de reservar otra.';
    case 'CUSTOMER_OVERLAP':
      return 'Ya tienes otra cita reservada que se solapa con este horario.';
    case 'EMPLOYEE_UNAVAILABLE':
      return 'Ese profesional ya no tiene disponible este hueco. Elige otro horario o profesional.';
    case 'NO_EMPLOYEE_AVAILABLE':
      return 'Ningún profesional tiene disponible ese hueco ahora mismo. Prueba con otro horario.';
    case 'SLOT_TAKEN':
      return 'Vaya, ese hueco se acaba de ocupar. Te proponemos otras horas disponibles:';
    case 'CUSTOMER_CONFLICT':
      return 'Ese teléfono ya está asociado a otro cliente con un email distinto. Revisa tus datos o contacta con el negocio.';
    case 'BUSINESS_NOT_FOUND':
      return 'No encontramos este negocio. Puede que el enlace ya no esté disponible.';
    case 'SERVICE_NOT_FOUND':
      return 'Este servicio ya no está disponible.';
    default: {
      const exhaustiveCheck: never = reason;
      return exhaustiveCheck;
    }
  }
}

export function getConfirmErrorMessage(reason: ConfirmAppointmentFailureReason): string {
  switch (reason) {
    case 'NOT_FOUND':
      return 'No encontramos ninguna cita con este enlace. Puede que ya haya sido usado o que el enlace no sea correcto.';
    case 'EXPIRED':
      return 'El enlace de confirmación ha caducado (han pasado más de 30 minutos desde la reserva). El hueco ya se ha liberado: puedes volver a reservar.';
    case 'INVALID_STATE':
      return 'Esta cita ya no se puede confirmar (puede que ya estuviera confirmada, cancelada o completada).';
    default: {
      const exhaustiveCheck: never = reason;
      return exhaustiveCheck;
    }
  }
}

export function getCancelErrorMessage(reason: CancelAppointmentFailureReason): string {
  switch (reason) {
    case 'NOT_FOUND':
      return 'No encontramos ninguna cita con este enlace.';
    case 'INVALID_STATE':
      return 'Esta cita ya no se puede cancelar (puede que ya estuviera completada o marcada como no presentada).';
    default: {
      const exhaustiveCheck: never = reason;
      return exhaustiveCheck;
    }
  }
}
