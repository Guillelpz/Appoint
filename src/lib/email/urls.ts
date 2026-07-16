export function getAppBaseUrl(): string {
  return process.env.APP_BASE_URL || 'http://localhost:3000';
}

export function buildConfirmUrl(token: string): string {
  return `${getAppBaseUrl()}/confirmar/${token}`;
}

export function buildCancelUrl(token: string): string {
  return `${getAppBaseUrl()}/cita/${token}`;
}
