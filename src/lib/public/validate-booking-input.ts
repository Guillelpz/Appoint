export interface ValidBookingCustomerData {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
}

export type ValidateBookingInputResult =
  | { ok: true; value: ValidBookingCustomerData }
  | { ok: false };

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PHONE_PATTERN = /^\+?\d{9,15}$/;
export const PHONE_SEPARATORS_PATTERN = /[\s\-.()]/g;

export function validateBookingInput(input: {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  start: Date;
}): ValidateBookingInputResult {
  const name = input.customerName.trim();
  const email = input.customerEmail.trim().toLowerCase();
  const phone = input.customerPhone.replace(PHONE_SEPARATORS_PATTERN, '');

  if (name.length === 0 || name.length > 120) {
    return { ok: false };
  }

  if (email.length === 0 || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return { ok: false };
  }

  if (!PHONE_PATTERN.test(phone)) {
    return { ok: false };
  }

  if (Number.isNaN(input.start.getTime())) {
    return { ok: false };
  }

  return {
    ok: true,
    value: {
      customerName: name,
      customerPhone: phone,
      customerEmail: email,
    },
  };
}

export interface ValidManualAppointmentCustomerData {
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
}

export type ValidateManualAppointmentInputResult =
  | { ok: true; value: ValidManualAppointmentCustomerData }
  | { ok: false };

// A diferencia de validateBookingInput (flujo público, exige los 3 campos),
// esta variante es para el alta manual desde el panel: solo el nombre es
// obligatorio; teléfono y email son opcionales pero, si se indican, deben
// tener un formato válido (mismos patrones que el flujo público).
export function validateManualAppointmentInput(input: {
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
}): ValidateManualAppointmentInputResult {
  const name = input.customerName.trim();
  if (name.length === 0 || name.length > 120) {
    return { ok: false };
  }

  let phone: string | null = null;
  const rawPhone = input.customerPhone?.trim();
  if (rawPhone) {
    const normalizedPhone = rawPhone.replace(PHONE_SEPARATORS_PATTERN, '');
    if (!PHONE_PATTERN.test(normalizedPhone)) {
      return { ok: false };
    }
    phone = normalizedPhone;
  }

  let email: string | null = null;
  const rawEmail = input.customerEmail?.trim();
  if (rawEmail) {
    const normalizedEmail = rawEmail.toLowerCase();
    if (normalizedEmail.length > 254 || !EMAIL_PATTERN.test(normalizedEmail)) {
      return { ok: false };
    }
    email = normalizedEmail;
  }

  return { ok: true, value: { customerName: name, customerPhone: phone, customerEmail: email } };
}
