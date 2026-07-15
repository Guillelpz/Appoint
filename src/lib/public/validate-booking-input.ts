export interface ValidBookingCustomerData {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
}

export type ValidateBookingInputResult =
  | { ok: true; value: ValidBookingCustomerData }
  | { ok: false };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?\d{9,15}$/;
const PHONE_SEPARATORS_PATTERN = /[\s\-.()]/g;

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
